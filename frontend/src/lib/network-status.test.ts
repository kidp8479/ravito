import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { syncOnlineManagerWithNavigator } from './network-status';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    configurable: true,
  });
}

describe('syncOnlineManagerWithNavigator', () => {
  afterEach(() => {
    setOnline(true);
  });

  it('primes onlineManager with the current navigator.onLine value immediately, not just on the next transition', () => {
    // TanStack Query's default onlineManager assumes online until a
    // browser event fires - this is the exact gap RAV-19 hit: starting
    // the app already offline never fires that event, so queries would
    // attempt real fetches instead of pausing. This test is what would
    // have caught it.
    setOnline(false);

    syncOnlineManagerWithNavigator();

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('keeps tracking online/offline events afterward', () => {
    setOnline(true);
    syncOnlineManagerWithNavigator();
    expect(onlineManager.isOnline()).toBe(true);

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(onlineManager.isOnline()).toBe(false);

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(onlineManager.isOnline()).toBe(true);
  });
});
