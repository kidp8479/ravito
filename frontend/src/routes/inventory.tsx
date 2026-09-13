import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { FastAddCard } from '@/components/fast-add-card';
import { InventoryGroups } from '@/components/inventory-list';
import { Input } from '@/components/ui/input';
import { ensureAuthLoaded } from '@/lib/api';
import { getAuthState } from '@/lib/auth-store';
import { useMyHousehold } from '@/lib/households';
import { useInventoryItems } from '@/lib/inventory';

export const Route = createFileRoute('/inventory')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: InventoryPage,
});

function InventoryPage() {
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
      {household.data && <InventoryContent householdId={household.data.id} />}
    </main>
  );
}

function InventoryContent({ householdId }: { householdId: string }) {
  const items = useInventoryItems(householdId);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = query
    ? (items.data ?? []).filter((item) =>
        item.product.name.toLowerCase().includes(query),
      )
    : (items.data ?? []);

  return (
    <>
      <FastAddCard householdId={householdId} />
      {items.isSuccess && items.data.length > 0 && (
        <Input
          type="search"
          placeholder="Search the inventory..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search the inventory"
        />
      )}
      <InventoryStatus
        items={items}
        filteredCount={filtered.length}
        search={search}
      />
      {items.isSuccess && (
        <InventoryGroups
          items={filtered}
          query={query}
          householdId={householdId}
        />
      )}
    </>
  );
}

function InventoryStatus({
  items,
  filteredCount,
  search,
}: {
  items: ReturnType<typeof useInventoryItems>;
  filteredCount: number;
  search: string;
}) {
  if (items.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Loading inventory...</p>
    );
  }
  if (items.isError) {
    return (
      <p className="text-destructive text-sm">
        Could not load the inventory. Please reload the page.
      </p>
    );
  }
  if (items.isSuccess && items.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing in the inventory yet.
      </p>
    );
  }
  if (items.isSuccess && items.data.length > 0 && filteredCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No item matches "{search}".
      </p>
    );
  }
  return null;
}
