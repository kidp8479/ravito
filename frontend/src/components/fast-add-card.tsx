import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/form';
import { ProductPickerCard } from '@/components/product-picker-card';
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
    <ProductPickerCard
      title="Add to inventory"
      description="Search the catalogue, or add a new product."
      picker={picker}
      productFieldId="fast-add-name"
      onSubmit={handleSubmit}
      pending={pending}
      submitLabel="Add"
      pendingLabel="Adding..."
      error={error}
    >
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
    </ProductPickerCard>
  );
}

export { FastAddCard };
