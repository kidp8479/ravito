import { useState } from 'react';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/api';
import {
  CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
  useDeleteInventoryItem,
  useUpdateInventoryItem,
  useUpdateProduct,
  type InventoryItem,
  type ProductCategory,
} from '@/lib/inventory';

const CATEGORY_ORDER: (ProductCategory | 'UNCATEGORIZED')[] = [
  ...PRODUCT_CATEGORIES,
  'UNCATEGORIZED',
];

const ALL_CATEGORY_LABELS: Record<ProductCategory | 'UNCATEGORIZED', string> = {
  ...CATEGORY_LABELS,
  UNCATEGORIZED: 'Uncategorized',
};

function groupByCategory(
  items: InventoryItem[],
): Map<ProductCategory | 'UNCATEGORIZED', InventoryItem[]> {
  const groups = new Map<ProductCategory | 'UNCATEGORIZED', InventoryItem[]>();
  for (const item of items) {
    const key = item.product.category ?? 'UNCATEGORIZED';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

// Renders the inventory grouped by category. `query` is only used to key
// each section so it remounts (resetting to expanded) when a search starts
// or ends - see InventorySection.
function InventoryGroups({
  items,
  query,
  householdId,
}: {
  items: InventoryItem[];
  query: string;
  householdId: string;
}) {
  const groups = groupByCategory(items);

  return (
    <>
      {CATEGORY_ORDER.map((category) => {
        const groupItems = groups.get(category);
        if (!groupItems || groupItems.length === 0) return null;
        return (
          <InventorySection
            key={`${category}-${query ? 'search' : 'browse'}`}
            label={ALL_CATEGORY_LABELS[category]}
            items={groupItems}
            householdId={householdId}
          />
        );
      })}
    </>
  );
}

function InventorySection({
  label,
  items,
  householdId,
}: {
  label: string;
  items: InventoryItem[];
  householdId: string;
}) {
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground transition-transform group-open:rotate-90">
          &gt;
        </span>
        {label}
        <span className="text-muted-foreground font-normal">
          ({items.length})
        </span>
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <InventoryRow key={item.id} item={item} householdId={householdId} />
        ))}
      </ul>
    </details>
  );
}

function InventoryRow({
  item,
  householdId,
}: {
  item: InventoryItem;
  householdId: string;
}) {
  const update = useUpdateInventoryItem(householdId);
  const remove = useDeleteInventoryItem(householdId);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InventoryRowEditForm
        item={item}
        householdId={householdId}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>{item.product.name}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            update.mutate({
              id: item.id,
              quantity: Math.max(0, item.quantity - 1),
            })
          }
          disabled={update.isPending}
        >
          -
        </Button>
        <span className="w-16 text-center">
          {item.quantity} {item.unit}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            update.mutate({ id: item.id, quantity: item.quantity + 1 })
          }
          disabled={update.isPending}
        >
          +
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => remove.mutate(item.id)}
          disabled={remove.isPending}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

function InventoryRowEditForm({
  item,
  householdId,
  onDone,
}: {
  item: InventoryItem;
  householdId: string;
  onDone: () => void;
}) {
  const updateItem = useUpdateInventoryItem(householdId);
  const updateProduct = useUpdateProduct(householdId);
  const [name, setName] = useState(item.product.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [category, setCategory] = useState<ProductCategory | ''>(
    item.product.category ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const pending = updateItem.isPending || updateProduct.isPending;

  async function handleSave() {
    setError(null);
    try {
      const trimmedName = name.trim();
      await Promise.all([
        updateItem.mutateAsync({
          id: item.id,
          quantity: Number(quantity),
          unit,
        }),
        trimmedName !== item.product.name ||
        category !== (item.product.category ?? '')
          ? updateProduct.mutateAsync({
              id: item.product.id,
              name: trimmedName !== item.product.name ? trimmedName : undefined,
              category: category || undefined,
            })
          : Promise.resolve(),
      ]);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border p-2 text-sm">
      <Input
        maxLength={100}
        className="font-medium"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Name"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          step="any"
          className="w-20"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label="Quantity"
        />
        <Input
          maxLength={20}
          className="w-24"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label="Unit"
        />
        <Select
          className="flex-1"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as ProductCategory | '')
          }
          aria-label="Category"
        >
          <option value="">Uncategorized</option>
          {PRODUCT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={pending}>
          Save
        </Button>
      </div>
    </li>
  );
}

export { InventoryGroups };
