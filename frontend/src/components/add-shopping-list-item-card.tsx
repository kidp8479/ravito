import { useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form';
import { ProductSuggestions } from '@/components/product-suggestions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>Add to the shopping list</CardTitle>
        <CardDescription>
          Type a free-text item, or pick one from the catalogue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Item" htmlFor="shopping-list-name">
            <Input
              id="shopping-list-name"
              required
              maxLength={100}
              autoComplete="off"
              value={picker.name}
              onChange={(event) => picker.changeName(event.target.value)}
            />
            <ProductSuggestions
              suggestions={picker.suggestions}
              onSelect={picker.selectProduct}
            />
          </FormField>
          <div className="flex gap-4">
            <FormField label="Quantity" htmlFor="shopping-list-quantity">
              <Input
                id="shopping-list-quantity"
                type="number"
                min={0}
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
          <FormError message={error} />
          <Button type="submit" disabled={createItem.isPending}>
            {createItem.isPending ? 'Adding...' : 'Add'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export { AddShoppingListItemCard };
