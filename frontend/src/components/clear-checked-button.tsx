import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form';
import { getErrorMessage } from '@/lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const checkedItems = items.filter((item) => item.checked);

  if (checkedItems.length === 0) return null;

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      await Promise.all(
        checkedItems.map((item) => remove.mutateAsync(item.id)),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={handleClear} disabled={clearing}>
        {clearing
          ? 'Clearing...'
          : `Clear ${checkedItems.length} checked item${checkedItems.length > 1 ? 's' : ''}`}
      </Button>
      <FormError message={error} />
    </div>
  );
}

export { ClearCheckedButton };
