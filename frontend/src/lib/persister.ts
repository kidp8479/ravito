import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const STORAGE_KEY = 'ravito:query-cache';

// Minimal offline support (RAV-19, PLAN.md): the query cache survives a
// reload or an offline app start, so already-loaded household data
// (inventory, shopping list, purchase history) is visible immediately
// instead of a blank loading state with no network to fill it from.
//
// createAsyncStoragePersister, not the sync variant: the latter is
// deprecated in this version of the library even for plain
// window.localStorage - this is the maintained replacement, same
// synchronous storage underneath, just an async-compatible interface.
export const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: STORAGE_KEY,
});

// Called directly on logout (lib/auth.ts's useLogout), not left to
// queryClient.clear()'s reactive persist: the persister throttles writes
// to ~1/second, so relying on that alone loses the race against a tab
// closed right after logout, leaving the previous account's data
// readable in localStorage on a shared/public computer for up to
// maxAge. This bypasses the throttle entirely.
export function clearPersistedCache(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, disabled) - nothing was ever
    // persisted to begin with.
  }
}
