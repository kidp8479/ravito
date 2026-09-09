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
import { useCreateInventoryItem, useCreateProduct } from '@/lib/inventory';
import { useProductPicker } from '@/lib/use-product-picker';

// "Search the household's product catalogue, create on the fly if absent"
// fast-add flow (PLAN.md).
function FastAddCard({ householdId }: { householdId: string }) {
  const picker = useProductPicker(householdId);
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const createProduct = useCreateProduct(householdId);
  const createItem = useCreateInventoryItem(householdId);
  const pending = createProduct.isPending || createItem.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      let productId = picker.selectedProductId;
      if (!productId) {
        productId = (await createProduct.mutateAsync(picker.name)).id;
        // Recorded before the next await: if createItem below fails (a
        // network blip, say), the product was still created - resubmitting
        // must reuse it via createItem alone, not call createProduct again
        // and 409 on the name it just claimed.
        picker.setSelectedProductId(productId);
      }
      await createItem.mutateAsync({
        productId,
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
        <CardTitle>Add to inventory</CardTitle>
        <CardDescription>
          Search the catalogue, or add a new product.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Product" htmlFor="fast-add-name">
            <Input
              id="fast-add-name"
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
            <FormField label="Quantity" htmlFor="fast-add-quantity">
              <Input
                id="fast-add-quantity"
                type="number"
                min={0}
                step="any"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FormField>
            <FormField label="Unit" htmlFor="fast-add-unit">
              <Input
                id="fast-add-unit"
                required
                maxLength={20}
                value={picker.unit}
                onChange={(event) => picker.setUnit(event.target.value)}
              />
            </FormField>
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding...' : 'Add'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export { FastAddCard };
