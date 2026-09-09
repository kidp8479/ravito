import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPersistedCache } from './persister';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('clearPersistedCache', () => {
  it('removes the persisted query cache key', () => {
    localStorage.setItem('ravito:query-cache', '{"some":"data"}');

    clearPersistedCache();

    expect(localStorage.getItem('ravito:query-cache')).toBeNull();
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => clearPersistedCache()).not.toThrow();
  });
});
