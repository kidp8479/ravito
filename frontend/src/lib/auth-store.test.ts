import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AuthStore from './auth-store';

// The store keeps module-level singleton state (not reset by any public
// API), so each test gets a fresh module instance instead of relying on
// import order or manual cleanup between tests.
async function freshStore(): Promise<typeof AuthStore> {
  vi.resetModules();
  return import('./auth-store');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth-store', () => {
  it('starts in the loading state', async () => {
    const store = await freshStore();
    expect(store.getAuthState()).toEqual({ status: 'loading' });
  });

  it('setAccessToken moves to authenticated and records the session hint', async () => {
    const store = await freshStore();
    store.setAccessToken('token-1');

    expect(store.getAuthState()).toEqual({
      status: 'authenticated',
      accessToken: 'token-1',
    });
    expect(store.getAccessToken()).toBe('token-1');
    expect(store.hasSessionHint()).toBe(true);
  });

  it('clearAccessToken moves to anonymous and clears the session hint', async () => {
    const store = await freshStore();
    store.setAccessToken('token-1');
    store.clearAccessToken();

    expect(store.getAuthState()).toEqual({ status: 'anonymous' });
    expect(store.getAccessToken()).toBeNull();
    expect(store.hasSessionHint()).toBe(false);
  });

  it('notifies subscribers on every state change, until unsubscribed', async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeAuth(listener);

    store.setAccessToken('token-1');
    store.clearAccessToken();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.setAccessToken('token-2');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('hasSessionHint fails open (true) when localStorage throws', async () => {
    const store = await freshStore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(store.hasSessionHint()).toBe(true);
  });
});
