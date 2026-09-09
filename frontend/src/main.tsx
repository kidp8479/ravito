import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { syncOnlineManagerWithNavigator } from './lib/network-status';
import { persister } from './lib/persister';
import { queryClient } from './lib/query-client';
import { routeTree } from './routeTree.gen';

// Before any query can mount and subscribe to the default onlineManager -
// see network-status.ts for why this matters starting the app offline.
syncOnlineManagerWithNavigator();

const router = createRouter({
  routeTree,
  defaultPendingComponent: () => (
    <div className="flex min-h-svh items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        // Queries only. By default a *paused* mutation is persisted too
        // (TanStack's own resumable-mutations feature) - but this app
        // doesn't register mutationFns via setMutationDefaults, so a
        // persisted mutation could never actually resume after a reload
        // anyway (docs/known-limitations.md), and a login/register
        // attempt made while offline would pause with the submitted
        // password sitting in its `variables` - persisting it to
        // localStorage in plaintext would be a real credential leak for
        // no benefit whatsoever. Excluded unconditionally, not just for
        // auth mutations, since none of them can resume from storage.
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          // Same as the library's own default (persist any successful
          // query), plus an explicit per-query opt-out via
          // meta.persist: false - lib/inventory.ts's useSearchProducts
          // uses it so its one-cache-entry-per-keystroke results don't
          // bloat the persisted blob for a whole day.
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && query.meta?.persist !== false,
        },
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
