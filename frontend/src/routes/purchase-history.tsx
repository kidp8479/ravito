import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { AddPurchaseCard } from '@/components/add-purchase-card';
import { AppHeader } from '@/components/app-header';
import { ensureAuthLoaded } from '@/lib/api';
import { getAuthState } from '@/lib/auth-store';
import { useMyHousehold } from '@/lib/households';
import {
  usePurchaseHistory,
  type PurchaseHistoryEntry,
} from '@/lib/purchase-history';

export const Route = createFileRoute('/purchase-history')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: PurchaseHistoryPage,
});

function PurchaseHistoryPage() {
  const household = useMyHousehold();

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-8">
      <AppHeader />

      {household.isLoading && (
        <p className="text-muted-foreground text-sm">Loading...</p>
      )}
      {household.isError && (
        <p className="text-destructive text-sm">
          Could not load your household. Please reload the page.
        </p>
      )}
      {household.isSuccess && !household.data && (
        <p className="text-muted-foreground text-sm">
          You do not have a household yet.{' '}
          <Link to="/household" className="text-foreground underline">
            Create or join one
          </Link>
          .
        </p>
      )}
      {household.data && (
        <PurchaseHistoryContent householdId={household.data.id} />
      )}
    </main>
  );
}

function PurchaseHistoryContent({ householdId }: { householdId: string }) {
  const history = usePurchaseHistory(householdId);
  const entries = history.data ?? [];

  return (
    <>
      <AddPurchaseCard householdId={householdId} />

      {history.isLoading && (
        <p className="text-muted-foreground text-sm">
          Loading purchase history...
        </p>
      )}
      {history.isError && (
        <p className="text-destructive text-sm">
          Could not load the purchase history. Please reload the page.
        </p>
      )}
      {history.isSuccess && entries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No purchases logged yet.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <PurchaseHistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}

function PurchaseHistoryRow({ entry }: { entry: PurchaseHistoryEntry }) {
  return (
    <li className="bg-card flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <div className="flex flex-col">
        <span>{entry.productName}</span>
        <span className="text-muted-foreground text-xs">
          {new Date(entry.purchasedOn).toLocaleDateString()} - {entry.quantity}{' '}
          {entry.unit}
        </span>
      </div>
      {entry.unitPrice && (
        <span className="text-muted-foreground">{entry.unitPrice}</span>
      )}
    </li>
  );
}
