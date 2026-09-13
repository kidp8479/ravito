import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/lib/auth';

// Every household screen links to every other one - centralized here
// instead of each route hand-duplicating the same set of Button/Link
// pairs (RAV-20 review: a 4th near-identical copy was about to be
// written). All links stay visible; the current page is highlighted
// rather than removed, so the nav doesn't reshuffle on every navigation.
const NAV_LINKS = [
  { to: '/household', label: 'Household' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/shopping-list', label: 'Shopping list' },
  { to: '/purchase-history', label: 'Purchase history' },
] as const;

// Inventory and shopping list render near-identical add-card + row-list
// layouts, so the page title was the only thing that could tell them apart
// - and it didn't, since every screen just showed the app name. Each screen
// now gets its own icon/color/one-line purpose, sourced from the same
// pathname NAV_LINKS already keys off.
const PAGE_META: Record<
  (typeof NAV_LINKS)[number]['to'],
  { emoji: string; title: string; description: string; accent: string }
> = {
  '/household': {
    emoji: '🏠',
    title: 'Household',
    description: 'Members and invites for your household.',
    accent: 'text-blue-600 dark:text-blue-400',
  },
  '/inventory': {
    emoji: '🧺',
    title: 'Inventory',
    description: 'What you currently have in stock at home.',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  '/shopping-list': {
    emoji: '🛒',
    title: 'Shopping list',
    description: 'What you still need to buy.',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  '/purchase-history': {
    emoji: '🧾',
    title: 'Purchase history',
    description: 'Past purchases logged for this household.',
    accent: 'text-violet-600 dark:text-violet-400',
  },
};

function AppHeader({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const logout = useLogout();
  const meta = PAGE_META[location.pathname as (typeof NAV_LINKS)[number]['to']];

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold">Ravito</span>
          {me.data && (
            <span className="text-muted-foreground">
              Signed in as {me.data.displayName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {NAV_LINKS.map((link) => {
            const isActive = link.to === location.pathname;
            return (
              <Button
                key={link.to}
                asChild
                variant={isActive ? 'secondary' : 'ghost'}
                aria-current={isActive ? 'page' : undefined}
              >
                <Link to={link.to}>{link.label}</Link>
              </Button>
            );
          })}
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
      </div>
      {meta && (
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">
            {meta.emoji}
          </span>
          <div>
            <h1 className={`text-xl font-semibold ${meta.accent}`}>
              {meta.title}
            </h1>
            <p className="text-muted-foreground text-sm">{meta.description}</p>
          </div>
        </div>
      )}
    </header>
  );
}

export { AppHeader };
