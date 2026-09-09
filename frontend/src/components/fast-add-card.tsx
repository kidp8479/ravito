import { useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form';
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
import {
  useCreateInventoryItem,
  useCreateProduct,
  useSearchProducts,
  type Product,
} from '@/lib/inventory';
import { useDebouncedValue } from '@/lib/use-debounced-value';

// "Search the household's product catalogue, create on the fly if absent"
// fast-add flow (PLAN.md).
function FastAddCard({ householdId }: { householdId: string }) {
  const [name, setName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Debounced: without it, every keystroke fires its own search request
  // against the household's product catalogue.
  const debouncedName = useDebouncedValue(name, 250);
  const search = useSearchProducts(
    householdId,
    selectedProductId ? '' : debouncedName,
  );
  const createProduct = useCreateProduct(householdId);
  const createItem = useCreateInventoryItem(householdId);
  const pending = createProduct.isPending || createItem.isPending;
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
      let productId = selectedProductId;
      if (!productId) {
        productId = (await createProduct.mutateAsync(name)).id;
        // Recorded before the next await: if createItem below fails (a
        // network blip, say), the product was still created - resubmitting
        // must reuse it via createItem alone, not call createProduct again
        // and 409 on the name it just claimed.
        setSelectedProductId(productId);
      }
      await createItem.mutateAsync({
        productId,
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
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
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

function ProductSuggestions({
  suggestions,
  onSelect,
}: {
  suggestions: Product[];
  onSelect: (product: Product) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="border-input mt-1 flex flex-col rounded-md border text-sm">
      {suggestions.map((product) => (
        <li key={product.id}>
          <button
            type="button"
            className="hover:bg-accent w-full px-3 py-2 text-left"
            onClick={() => onSelect(product)}
          >
            {product.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export { FastAddCard };
