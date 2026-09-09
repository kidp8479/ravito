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
import { useCreateProduct } from '@/lib/inventory';
import { useLogPurchase } from '@/lib/purchase-history';
import { useProductPicker } from '@/lib/use-product-picker';

// Same "search the catalogue, create on the fly if absent" flow as
// FastAddCard (inventory) - a purchase-history row always needs a real
// productId (unlike a shopping-list item, whose productId is optional).
function AddPurchaseCard({ householdId }: { householdId: string }) {
  const picker = useProductPicker(householdId);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createProduct = useCreateProduct(householdId);
  const logPurchase = useLogPurchase(householdId);
  const pending = createProduct.isPending || logPurchase.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      let productId = picker.selectedProductId;
      if (!productId) {
        productId = (await createProduct.mutateAsync(picker.name)).id;
        // Same reasoning as FastAddCard: recorded before the next await
        // so a resubmit after a failure reuses this product instead of
        // trying to create it again and 409ing on the name it just claimed.
        picker.setSelectedProductId(productId);
      }
      await logPurchase.mutateAsync({
        productId,
        quantity: Number(quantity),
        unit: picker.unit,
        unitPrice: unitPrice ? Number(unitPrice) : undefined,
        purchasedOn: purchasedOn || undefined,
      });
      picker.reset();
      setQuantity('1');
      setUnitPrice('');
      setPurchasedOn('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a purchase</CardTitle>
        <CardDescription>
          Search the catalogue, or add a new product.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Product" htmlFor="purchase-name">
            <Input
              id="purchase-name"
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
            <FormField label="Quantity" htmlFor="purchase-quantity">
              <Input
                id="purchase-quantity"
                type="number"
                min={0}
                step="any"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FormField>
            <FormField label="Unit" htmlFor="purchase-unit">
              <Input
                id="purchase-unit"
                required
                maxLength={20}
                value={picker.unit}
                onChange={(event) => picker.setUnit(event.target.value)}
              />
            </FormField>
          </div>
          <div className="flex gap-4">
            <FormField label="Price (optional)" htmlFor="purchase-price">
              <Input
                id="purchase-price"
                type="number"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </FormField>
            <FormField label="Date (optional)" htmlFor="purchase-date">
              <Input
                id="purchase-date"
                type="date"
                value={purchasedOn}
                onChange={(event) => setPurchasedOn(event.target.value)}
              />
            </FormField>
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Logging...' : 'Log purchase'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export { AddPurchaseCard };
