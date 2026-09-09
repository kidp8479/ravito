import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getErrorMessage } from '@/lib/api';
import type { InventoryItem } from '@/lib/inventory';
import {
  useAddCheckedItemToInventory,
  useCheckShoppingListItem,
  useDeleteShoppingListItem,
  type ShoppingListItem,
} from '@/lib/shopping-list';
import { cn } from '@/lib/utils';

function ShoppingListRow({
  item,
  householdId,
  inventory,
  autoAddToInventory,
}: {
  item: ShoppingListItem;
  householdId: string;
  inventory: InventoryItem[];
  autoAddToInventory: boolean;
}) {
  const check = useCheckShoppingListItem(householdId);
  const remove = useDeleteShoppingListItem(householdId);
  const addToInventory = useAddCheckedItemToInventory(householdId);
  const [error, setError] = useState<string | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  function handleCheckedChange(checked: boolean) {
    setError(null);
    check.mutate(
      { id: item.id, checked },
      {
        // Only files the checked item into inventory once the check
        // itself is confirmed - firing both together would still add to
        // inventory on a check that the server actually rejected.
        onSuccess: () => {
          if (checked && autoAddToInventory && item.productId) {
            addToInventory.mutate(
              { item, inventory },
              { onError: (err) => setError(getErrorMessage(err)) },
            );
          }
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  }

  function handleRemove() {
    setError(null);
    remove.mutate(item.id, {
      onError: (err) => setError(getErrorMessage(err)),
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-card flex flex-col gap-1 rounded-md border p-2 text-sm',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted-foreground cursor-grab touch-none px-1"
          aria-label="Drag to reorder"
        >
          ::
        </button>
        <Checkbox
          checked={item.checked}
          onCheckedChange={(checked) => handleCheckedChange(checked === true)}
          disabled={check.isPending}
        />
        <span
          className={cn(
            'flex-1',
            item.checked && 'text-muted-foreground line-through',
          )}
        >
          {item.rawLabel}{' '}
          <span className="text-muted-foreground">
            ({item.quantity} {item.unit})
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={remove.isPending}
        >
          Remove
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </li>
  );
}

export { ShoppingListRow };
