import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  function handleCheckedChange(checked: boolean) {
    check.mutate({ id: item.id, checked });
    if (checked && autoAddToInventory && item.productId) {
      addToInventory.mutate({ item, inventory });
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-card flex items-center gap-2 rounded-md border p-2 text-sm',
        isDragging && 'opacity-50',
      )}
    >
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
        onClick={() => remove.mutate(item.id)}
        disabled={remove.isPending}
      >
        Remove
      </Button>
    </li>
  );
}

export { ShoppingListRow };
