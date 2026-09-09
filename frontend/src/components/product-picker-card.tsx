import type { FormEvent, ReactNode } from 'react';
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
import type { useProductPicker } from '@/lib/use-product-picker';

// The "search the catalogue via a Product field + suggestions dropdown,
// plus whatever fields this particular flow needs, in a Card with a form"
// shell shared by FastAddCard (inventory), AddShoppingListItemCard, and
// AddPurchaseCard - the third near-identical copy of this layout is what
// prompted pulling it out (RAV-20 review).
function ProductPickerCard({
  title,
  description,
  picker,
  productFieldId,
  productFieldLabel = 'Product',
  onSubmit,
  pending,
  submitLabel,
  pendingLabel,
  error,
  children,
}: {
  title: string;
  description: string;
  picker: ReturnType<typeof useProductPicker>;
  productFieldId: string;
  // AddShoppingListItemCard calls this "Item" (a free-text entry is
  // valid there, unlike FastAddCard/AddPurchaseCard, where it always
  // resolves to a real catalogue Product either way).
  productFieldLabel?: string;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormField label={productFieldLabel} htmlFor={productFieldId}>
            <Input
              id={productFieldId}
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
          {children}
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export { ProductPickerCard };
