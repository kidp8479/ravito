import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  useDeleteShoppingListItem,
  type ShoppingListItem,
} from '@/lib/shopping-list';

function ClearCheckedButton({
  items,
  householdId,
}: {
  items: ShoppingListItem[];
  householdId: string;
}) {
  const remove = useDeleteShoppingListItem(householdId);
  const [clearing, setClearing] = useState(false);
  const checkedItems = items.filter((item) => item.checked);

  if (checkedItems.length === 0) return null;

  async function handleClear() {
    setClearing(true);
    try {
      await Promise.all(
        checkedItems.map((item) => remove.mutateAsync(item.id)),
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClear} disabled={clearing}>
      {clearing
        ? 'Clearing...'
        : `Clear ${checkedItems.length} checked item${checkedItems.length > 1 ? 's' : ''}`}
    </Button>
  );
}

export { ClearCheckedButton };
