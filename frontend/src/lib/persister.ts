import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Minimal offline support (RAV-19, PLAN.md): the query cache survives a
// reload or an offline app start, so already-loaded household data
// (inventory, shopping list, purchase history) is visible immediately
// instead of a blank loading state with no network to fill it from.
// Cleared on logout via queryClient.clear() (lib/auth.ts's useLogout) -
// the persister re-syncs storage to the now-empty cache automatically,
// so a shared/public computer doesn't keep the previous account's data
// in localStorage after logout.
//
// createAsyncStoragePersister, not the sync variant: the latter is
// deprecated in this version of the library even for plain
// window.localStorage - this is the maintained replacement, same
// synchronous storage underneath, just an async-compatible interface.
export const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: 'ravito:query-cache',
});
