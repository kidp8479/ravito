import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { OfflineBanner } from '@/components/offline-banner';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}
