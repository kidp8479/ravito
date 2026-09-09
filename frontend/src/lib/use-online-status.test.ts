import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOnlineStatus } from './use-online-status';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    configurable: true,
  });
}

describe('useOnlineStatus', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    setOnline(originalOnLine);
  });

  it('reflects navigator.onLine at mount', () => {
    setOnline(false);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);
  });

  it('updates when the browser fires offline then online events', () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
