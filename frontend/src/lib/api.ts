import {
  clearAccessToken,
  getAccessToken,
  hasSessionHint,
  setAccessToken,
} from './auth-store';

// Exported: the shopping-list realtime socket (RAV-14) connects to the
// same backend host, not the frontend's own origin.
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong.';
}

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  // Skips the silent-refresh-and-retry on a 401 - for auth/login,
  // auth/register and auth/refresh itself, where a 401 means "wrong
  // credentials" or "no valid session", never "access token expired".
  skipAuthRetry?: boolean;
}

interface ErrorBody {
  message?: string | string[];
}

async function rawFetch(
  path: string,
  token: string | null,
  { method, body }: ApiFetchOptions,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    credentials: 'include', // sends/receives the httpOnly refresh cookie
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await rawFetch('/auth/refresh', null, {
      method: 'POST',
      skipAuthRetry: true,
    });
    if (!res.ok) {
      clearAccessToken();
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

// Exchanges the httpOnly refresh cookie for a fresh access token. Resolves
// to false (never rejects) on any failure, so callers can treat "not
// logged in" and "network hiccup" the same way: fall back to anonymous.
//
// Concurrent callers (e.g. several queries 401ing together after the
// access token expires) share one in-flight request instead of each
// firing their own: the backend rotates the refresh token on every use
// and treats a second presentation of the same one as theft, revoking the
// whole session - two parallel refresh calls would otherwise force-log-out
// a user who did nothing wrong.
let refreshInFlight: Promise<boolean> | null = null;
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// Runs once per page load: attempts the silent refresh above so route
// guards have a real answer (authenticated/anonymous) instead of the
// initial 'loading' state. Skips the network call entirely when the
// session hint says there was never a session to refresh - a fresh
// anonymous visit would otherwise always draw a guaranteed, noisy 401.
let bootstrap: Promise<void> | null = null;
export function ensureAuthLoaded(): Promise<void> {
  bootstrap ??= hasSessionHint()
    ? refreshAccessToken().then(() => undefined)
    : Promise.resolve(clearAccessToken());
  return bootstrap;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  if (Array.isArray(body?.message)) return body.message.join(', ');
  return body?.message ?? res.statusText;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  let res = await rawFetch(path, getAccessToken(), options);

  if (res.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, getAccessToken(), options);
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
