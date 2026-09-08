import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { queryClient } from './lib/query-client';
import { routeTree } from './routeTree.gen';

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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
