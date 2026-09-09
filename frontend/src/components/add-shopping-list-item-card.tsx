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
import { useSearchProducts, type Product } from '@/lib/inventory';
import { useCreateShoppingListItem } from '@/lib/shopping-list';
import { useDebouncedValue } from '@/lib/use-debounced-value';

// Free text (rawLabel only) or a catalogue pick (rawLabel + productId) -
// unlike FastAddCard (inventory), a free-text shopping-list item never
// needs a Product row created for it (schema: productId is optional,
// rawLabel always set).
function AddShoppingListItemCard({ householdId }: { householdId: string }) {
  const [name, setName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const debouncedName = useDebouncedValue(name, 250);
  const search = useSearchProducts(
    householdId,
    selectedProductId ? '' : debouncedName,
  );
  const createItem = useCreateShoppingListItem(householdId);
  const suggestions =
    !selectedProductId && name.trim() ? (search.data ?? []) : [];

  function selectProduct(product: Product) {
    setSelectedProductId(product.id);
    setName(product.name);
    if (product.defaultUnit) setUnit(product.defaultUnit);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createItem.mutateAsync({
        productId: selectedProductId ?? undefined,
        rawLabel: name.trim(),
        quantity: Number(quantity),
        unit,
      });
      setName('');
      setSelectedProductId(null);
      setQuantity('1');
      setUnit('');
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
              value={name}
              onChange={(event) => {
                setSelectedProductId(null);
                setName(event.target.value);
              }}
            />
            <ProductSuggestions
              suggestions={suggestions}
              onSelect={selectProduct}
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
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
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
