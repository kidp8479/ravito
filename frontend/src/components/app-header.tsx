import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/lib/auth';

// Every household screen links to every other one - centralized here
// instead of each route hand-duplicating the same set of Button/Link
// pairs (RAV-20 review: a 4th near-identical copy was about to be
// written). The current page filters itself out rather than linking to
// itself.
const NAV_LINKS = [
  { to: '/household', label: 'Household' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/shopping-list', label: 'Shopping list' },
  { to: '/purchase-history', label: 'Purchase history' },
] as const;

function AppHeader({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const logout = useLogout();

  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Ravito</h1>
        {me.data && (
          <p className="text-muted-foreground text-sm">
            Signed in as {me.data.displayName}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {NAV_LINKS.filter((link) => link.to !== location.pathname).map(
          (link) => (
            <Button key={link.to} asChild variant="ghost">
              <Link to={link.to}>{link.label}</Link>
            </Button>
          ),
        )}
        {children}
        <Button
          variant="outline"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => void navigate({ to: '/login' }),
            })
          }
          disabled={logout.isPending}
        >
          Log out
        </Button>
      </div>
    </header>
  );
}

export { AppHeader };
