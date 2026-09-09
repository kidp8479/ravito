import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Api from './api';
import type * as AuthStore from './auth-store';

const API_URL = 'http://localhost:3000';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

// Fresh module graph per test: api.ts and auth-store.ts both keep
// module-level singleton state (in-flight refresh promise, bootstrap
// promise, auth state) with no public reset, so re-importing after
// vi.resetModules() is the only reliable way to isolate tests.
async function freshApi(): Promise<{
  api: typeof Api;
  authStore: typeof AuthStore;
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const api = await import('./api');
  const authStore = await import('./auth-store');
  return { api, authStore, fetchMock };
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('resolves with the parsed JSON body on success', async () => {
    const { api, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { foo: 'bar' }));

    const result = await api.apiFetch<{ foo: string }>('/x');

    expect(result).toEqual({ foo: 'bar' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/x`,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('sends the access token and JSON content-type when set', async () => {
    const { api, authStore, fetchMock } = await freshApi();
    authStore.setAccessToken('token-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await api.apiFetch('/x', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('returns undefined for a 204 response', async () => {
    const { api, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));

    await expect(
      api.apiFetch('/x', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('throws ApiError with the joined message array on failure', async () => {
    const { api, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { message: ['bad a', 'bad b'] }),
    );

    await expect(api.apiFetch('/x')).rejects.toMatchObject({
      status: 400,
      message: 'bad a, bad b',
    });
  });

  it('refreshes once and retries on a 401, when not skipping auth retry', async () => {
    const { api, authStore, fetchMock } = await freshApi();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'refreshed' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await api.apiFetch<{ ok: boolean }>('/protected');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authStore.getAccessToken()).toBe('refreshed');
  });

  it('does not attempt a refresh when skipAuthRetry is set', async () => {
    const { api, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { message: 'bad creds' }),
    );

    await expect(
      api.apiFetch('/auth/login', {
        method: 'POST',
        body: {},
        skipAuthRetry: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('refreshAccessToken', () => {
  it('dedupes concurrent calls into a single request', async () => {
    const { api, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'refreshed' }),
    );

    const [first, second] = await Promise.all([
      api.refreshAccessToken(),
      api.refreshAccessToken(),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the session on a genuine 401 from the server', async () => {
    const { api, authStore, fetchMock } = await freshApi();
    authStore.setAccessToken('stale-token');
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));

    const result = await api.refreshAccessToken();

    expect(result).toBe(false);
    expect(authStore.getAuthState()).toEqual({ status: 'anonymous' });
  });

  it('assumes still-authenticated (RAV-19: offline) on a network error, when a session hint exists', async () => {
    const { api, authStore, fetchMock } = await freshApi();
    localStorage.setItem('ravito:hasSession', '1');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await api.refreshAccessToken();

    expect(result).toBe(false);
    expect(authStore.getAuthState()).toEqual({
      status: 'authenticated',
      accessToken: null,
    });
    // Not the server saying "you're logged out" - the hint that a
    // session existed stays, unlike the genuine-401 case above.
    expect(authStore.hasSessionHint()).toBe(true);
  });

  it('does not assume authenticated on a network error with no session hint', async () => {
    const { api, authStore, fetchMock } = await freshApi();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await api.refreshAccessToken();

    expect(result).toBe(false);
    expect(authStore.getAuthState()).toEqual({ status: 'loading' });
  });
});

describe('ensureAuthLoaded', () => {
  it('skips the network call when there is no session hint', async () => {
    const { api, authStore, fetchMock } = await freshApi();

    await api.ensureAuthLoaded();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(authStore.getAuthState()).toEqual({ status: 'anonymous' });
  });

  it('attempts a refresh when a session hint is present', async () => {
    localStorage.setItem('ravito:hasSession', '1');
    const { api, authStore, fetchMock } = await freshApi();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'restored' }),
    );

    await api.ensureAuthLoaded();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authStore.getAccessToken()).toBe('restored');
  });

  it('renders the app as authenticated-offline when starting up with no network (RAV-19)', async () => {
    localStorage.setItem('ravito:hasSession', '1');
    const { api, authStore, fetchMock } = await freshApi();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await api.ensureAuthLoaded();

    // Not 'anonymous': a route guard checking status !== 'authenticated'
    // must not redirect to /login just because the initial refresh
    // couldn't reach the server - that would block the persisted query
    // cache from ever being shown, defeating offline support entirely.
    expect(authStore.getAuthState()).toEqual({
      status: 'authenticated',
      accessToken: null,
    });
  });
});
