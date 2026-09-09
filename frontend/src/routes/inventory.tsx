import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { AppHeader } from '@/components/app-header';
import { FastAddCard } from '@/components/fast-add-card';
import { Button } from '@/components/ui/button';
import { ensureAuthLoaded } from '@/lib/api';
import { getAuthState } from '@/lib/auth-store';
import { useMyHousehold } from '@/lib/households';
import {
  useDeleteInventoryItem,
  useInventoryItems,
  useUpdateInventoryItem,
  type InventoryItem,
  type ProductCategory,
} from '@/lib/inventory';

export const Route = createFileRoute('/inventory')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: InventoryPage,
});

const CATEGORY_ORDER: (ProductCategory | 'UNCATEGORIZED')[] = [
  'FRUITS_AND_VEGETABLES',
  'DAIRY',
  'MEAT_AND_FISH',
  'BAKERY',
  'PANTRY',
  'FROZEN',
  'BEVERAGES',
  'HOUSEHOLD_AND_HYGIENE',
  'OTHER',
  'UNCATEGORIZED',
];

const CATEGORY_LABELS: Record<ProductCategory | 'UNCATEGORIZED', string> = {
  FRUITS_AND_VEGETABLES: 'Fruits & Vegetables',
  DAIRY: 'Dairy',
  MEAT_AND_FISH: 'Meat & Fish',
  BAKERY: 'Bakery',
  PANTRY: 'Pantry',
  FROZEN: 'Frozen',
  BEVERAGES: 'Beverages',
  HOUSEHOLD_AND_HYGIENE: 'Household & Hygiene',
  OTHER: 'Other',
  UNCATEGORIZED: 'Uncategorized',
};

function groupByCategory(
  items: InventoryItem[],
): Map<ProductCategory | 'UNCATEGORIZED', InventoryItem[]> {
  const groups = new Map<ProductCategory | 'UNCATEGORIZED', InventoryItem[]>();
  for (const item of items) {
    const key = item.product.category ?? 'UNCATEGORIZED';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function InventoryPage() {
  const household = useMyHousehold();

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-8">
      <AppHeader>
        <Button asChild variant="ghost">
          <Link to="/household">Household</Link>
        </Button>
      </AppHeader>

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
  const groups = groupByCategory(items.data ?? []);

  return (
    <>
      <FastAddCard householdId={householdId} />
      {items.isLoading && (
        <p className="text-muted-foreground text-sm">Loading inventory...</p>
      )}
      {items.isError && (
        <p className="text-destructive text-sm">
          Could not load the inventory. Please reload the page.
        </p>
      )}
      {items.isSuccess && items.data.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing in the inventory yet.
        </p>
      )}
      {CATEGORY_ORDER.map((category) => {
        const groupItems = groups.get(category);
        if (!groupItems || groupItems.length === 0) return null;
        return (
          <InventorySection
            key={category}
            label={CATEGORY_LABELS[category]}
            items={groupItems}
            householdId={householdId}
          />
        );
      })}
    </>
  );
}

function InventorySection({
  label,
  items,
  householdId,
}: {
  label: string;
  items: InventoryItem[];
  householdId: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <InventoryRow key={item.id} item={item} householdId={householdId} />
        ))}
      </ul>
    </section>
  );
}

function InventoryRow({
  item,
  householdId,
}: {
  item: InventoryItem;
  householdId: string;
}) {
  const update = useUpdateInventoryItem(householdId);
  const remove = useDeleteInventoryItem(householdId);

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>{item.product.name}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            update.mutate({
              id: item.id,
              quantity: Math.max(0, item.quantity - 1),
            })
          }
          disabled={update.isPending}
        >
          -
        </Button>
        <span className="w-16 text-center">
          {item.quantity} {item.unit}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            update.mutate({ id: item.id, quantity: item.quantity + 1 })
          }
          disabled={update.isPending}
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => remove.mutate(item.id)}
          disabled={remove.isPending}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}
