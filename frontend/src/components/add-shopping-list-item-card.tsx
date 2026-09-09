import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/form';
import { ProductPickerCard } from '@/components/product-picker-card';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { useCreateShoppingListItem } from '@/lib/shopping-list';
import { useProductPicker } from '@/lib/use-product-picker';

// Free text (rawLabel only) or a catalogue pick (rawLabel + productId) -
// unlike FastAddCard (inventory), a free-text shopping-list item never
// needs a Product row created for it (schema: productId is optional,
// rawLabel always set).
function AddShoppingListItemCard({ householdId }: { householdId: string }) {
  const picker = useProductPicker(householdId);
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const createItem = useCreateShoppingListItem(householdId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createItem.mutateAsync({
        productId: picker.selectedProductId ?? undefined,
        rawLabel: picker.name.trim(),
        quantity: Number(quantity),
        unit: picker.unit,
      });
      picker.reset();
      setQuantity('1');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <ProductPickerCard
      title="Add to the shopping list"
      description="Type a free-text item, or pick one from the catalogue."
      picker={picker}
      productFieldId="shopping-list-name"
      productFieldLabel="Item"
      onSubmit={handleSubmit}
      pending={createItem.isPending}
      submitLabel="Add"
      pendingLabel="Adding..."
      error={error}
    >
      <div className="flex gap-4">
        {/* min > 0: CreateShoppingListItemDto.quantity is @IsPositive(),
            not @Min(0) like inventory's - a 0-quantity shopping-list
            item isn't meaningful the way 0-in-stock is. */}
        <FormField label="Quantity" htmlFor="shopping-list-quantity">
          <Input
            id="shopping-list-quantity"
            type="number"
            min={0.001}
            step="any"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </FormField>
        <FormField label="Unit" htmlFor="shopping-list-unit">
          <Input
            id="shopping-list-unit"
            required
            maxLength={20}
            value={picker.unit}
            onChange={(event) => picker.setUnit(event.target.value)}
          />
        </FormField>
      </div>
    </ProductPickerCard>
  );
}

export { AddShoppingListItemCard };
