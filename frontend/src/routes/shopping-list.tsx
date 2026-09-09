import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { AddShoppingListItemCard } from '@/components/add-shopping-list-item-card';
import { AppHeader } from '@/components/app-header';
import { ClearCheckedButton } from '@/components/clear-checked-button';
import { ShoppingListRow } from '@/components/shopping-list-row';
import { Checkbox } from '@/components/ui/checkbox';
import { ensureAuthLoaded } from '@/lib/api';
import { getAuthState } from '@/lib/auth-store';
import { useMyHousehold } from '@/lib/households';
import { useInventoryItems } from '@/lib/inventory';
import {
  useAutoAddToInventorySetting,
  useShoppingListItems,
  useShoppingListRealtime,
  useUpdateShoppingListItem,
} from '@/lib/shopping-list';

export const Route = createFileRoute('/shopping-list')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: ShoppingListPage,
});

function ShoppingListPage() {
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
        <ShoppingListContent householdId={household.data.id} />
      )}
    </main>
  );
}

function ShoppingListContent({ householdId }: { householdId: string }) {
  useShoppingListRealtime(householdId);
  const items = useShoppingListItems(householdId);
  // Loaded once here (not per row): rows read the same cached snapshot to
  // decide "already in inventory?" for the auto-add rule below.
  const inventory = useInventoryItems(householdId);
  const reorder = useUpdateShoppingListItem(householdId);
  const [autoAddToInventory, setAutoAddToInventory] =
    useAutoAddToInventorySetting();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const list = items.data ?? [];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((item) => item.id === active.id);
    const newIndex = list.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Every item whose index actually shifted gets its own PATCH (no
    // sparse/fractional position scheme on the backend yet, see
    // docs/known-limitations.md): fine at household-shopping-list scale.
    // On a failed PATCH, refetch rather than leave that one row's cached
    // position out of sync with the rest of the list.
    arrayMove(list, oldIndex, newIndex).forEach((item, index) => {
      if (item.position !== index) {
        reorder.mutate(
          { id: item.id, position: index },
          { onError: () => void items.refetch() },
        );
      }
    });
  }

  return (
    <>
      <AddShoppingListItemCard householdId={householdId} />

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={autoAddToInventory}
          onCheckedChange={(checked) => setAutoAddToInventory(checked === true)}
        />
        Add checked items to inventory
      </label>

      {items.isLoading && (
        <p className="text-muted-foreground text-sm">
          Loading the shopping list...
        </p>
      )}
      {items.isError && (
        <p className="text-destructive text-sm">
          Could not load the shopping list. Please reload the page.
        </p>
      )}
      {items.isSuccess && list.length === 0 && (
        <p className="text-muted-foreground text-sm">
          The shopping list is empty.
        </p>
      )}

      {list.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={list.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {list.map((item) => (
                <ShoppingListRow
                  key={item.id}
                  item={item}
                  householdId={householdId}
                  inventory={inventory.data ?? []}
                  autoAddToInventory={autoAddToInventory}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ClearCheckedButton items={list} householdId={householdId} />
    </>
  );
}
