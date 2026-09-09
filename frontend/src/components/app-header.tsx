import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/lib/auth';

function AppHeader({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
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
