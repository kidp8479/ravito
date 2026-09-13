import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/form';
import { ProductPickerCard } from '@/components/product-picker-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { useCreateProduct } from '@/lib/inventory';
import { useLogPurchase } from '@/lib/purchase-history';
import { useProductPicker } from '@/lib/use-product-picker';

interface ReceiptLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

// Whole-receipt entry: lines accumulate locally (each still going through
// the same "search the catalogue, create on the fly if absent" flow as
// FastAddCard, so a receipt never creates a duplicate Product) and are
// only sent to the server - one POST per line, no bulk endpoint needed -
// once "Save receipt" is pressed. One purchasedOn date for the whole
// receipt: every line on a paper receipt was bought the same day.
function AddPurchaseCard({ householdId }: { householdId: string }) {
  const picker = useProductPicker(householdId);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [lineError, setLineError] = useState<string | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createProduct = useCreateProduct(householdId);
  const logPurchase = useLogPurchase(householdId);
  const addingLine = createProduct.isPending;

  async function handleAddLine(event: FormEvent) {
    event.preventDefault();
    setLineError(null);
    try {
      let productId = picker.selectedProductId;
      if (!productId) {
        productId = (await createProduct.mutateAsync({ name: picker.name })).id;
        // Same reasoning as FastAddCard: recorded before the next await
        // so re-adding a line with the same name after a failure reuses
        // this product instead of trying to create it again and 409ing
        // on the name it just claimed.
        picker.setSelectedProductId(productId);
      }
      setLines((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          productId,
          name: picker.name,
          quantity: Number(quantity),
          unit: picker.unit,
          unitPrice: unitPrice ? Number(unitPrice) : undefined,
        },
      ]);
      picker.reset();
      setQuantity('1');
      setUnitPrice('');
    } catch (err) {
      setLineError(getErrorMessage(err));
    }
  }

  function handleRemoveLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  async function handleSaveReceipt() {
    setSaveError(null);
    for (const line of lines) {
      try {
        await logPurchase.mutateAsync({
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          purchasedOn: purchasedOn || undefined,
        });
        // Drop each line as soon as it's logged, not all at once at the
        // end: if a later line fails, everything already saved stays
        // saved and out of the way, and only the real remainder is left
        // to retry.
        setLines((current) => current.filter((l) => l.id !== line.id));
      } catch (err) {
        setSaveError(
          `"${line.name}": ${getErrorMessage(err)} - the rest of the receipt was not saved yet, fix this line and try again.`,
        );
        return;
      }
    }
    setPurchasedOn('');
  }

  return (
    <div className="flex flex-col gap-4">
      <ProductPickerCard
        title="Add a receipt"
        description="Add each item from the receipt, then save it all at once."
        picker={picker}
        productFieldId="purchase-name"
        onSubmit={handleAddLine}
        pending={addingLine}
        submitLabel="Add to receipt"
        pendingLabel="Adding..."
        error={lineError}
      >
        <PurchaseLineFields
          quantity={quantity}
          onQuantityChange={setQuantity}
          unit={picker.unit}
          onUnitChange={picker.setUnit}
          unitPrice={unitPrice}
          onUnitPriceChange={setUnitPrice}
        />
      </ProductPickerCard>

      {lines.length > 0 && (
        <PendingReceiptLines
          lines={lines}
          purchasedOn={purchasedOn}
          onPurchasedOnChange={setPurchasedOn}
          onRemoveLine={handleRemoveLine}
          saveError={saveError}
          onSave={() => void handleSaveReceipt()}
          saving={logPurchase.isPending}
        />
      )}
    </div>
  );
}

function PurchaseLineFields({
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  unitPrice,
  onUnitPriceChange,
}: {
  quantity: string;
  onQuantityChange: (value: string) => void;
  unit: string;
  onUnitChange: (value: string) => void;
  unitPrice: string;
  onUnitPriceChange: (value: string) => void;
}) {
  return (
    <>
      {/* min > 0: CreatePurchaseHistoryDto.quantity is @IsPositive(), not
          @Min(0) like inventory's ("0 in stock" is valid, "logged 0 of
          something" isn't). */}
      <div className="flex gap-4">
        <FormField label="Quantity" htmlFor="purchase-quantity">
          <Input
            id="purchase-quantity"
            type="number"
            min={0.001}
            step="any"
            required
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
          />
        </FormField>
        <FormField label="Unit" htmlFor="purchase-unit">
          <Input
            id="purchase-unit"
            required
            maxLength={20}
            value={unit}
            onChange={(event) => onUnitChange(event.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Price (optional)" htmlFor="purchase-price">
        <Input
          id="purchase-price"
          type="number"
          min={0.01}
          step="0.01"
          value={unitPrice}
          onChange={(event) => onUnitPriceChange(event.target.value)}
        />
      </FormField>
    </>
  );
}

function PendingReceiptLines({
  lines,
  purchasedOn,
  onPurchasedOnChange,
  onRemoveLine,
  saveError,
  onSave,
  saving,
}: {
  lines: ReceiptLine[];
  purchasedOn: string;
  onPurchasedOnChange: (value: string) => void;
  onRemoveLine: (id: string) => void;
  saveError: string | null;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-md border p-3">
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span>
              {line.name} - {line.quantity} {line.unit}
              {line.unitPrice ? ` - ${line.unitPrice}` : ''}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveLine(line.id)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <FormField label="Receipt date (optional)" htmlFor="receipt-date">
        <Input
          id="receipt-date"
          type="date"
          value={purchasedOn}
          onChange={(event) => onPurchasedOnChange(event.target.value)}
        />
      </FormField>
      {saveError && <p className="text-destructive text-sm">{saveError}</p>}
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? 'Saving...' : `Save receipt (${lines.length})`}
      </Button>
    </div>
  );
}

export { AddPurchaseCard };
