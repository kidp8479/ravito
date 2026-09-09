import { QueryClient } from '@tanstack/react-query';

// gcTime long enough that cached data survives until the next persist
// cycle (RAV-19, lib/persister.ts) - the default 5 minutes would let
// TanStack drop it from memory well before a reload/offline start could
// ever make use of it again.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});
