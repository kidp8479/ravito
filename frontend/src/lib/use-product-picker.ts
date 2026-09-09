import { useState } from 'react';
import { useSearchProducts, type Product } from './inventory';
import { useDebouncedValue } from './use-debounced-value';

// Shared between FastAddCard (inventory) and AddShoppingListItemCard
// (shopping list): both let the user type a name, get debounced
// catalogue suggestions, and pick one to prefill its default unit.
export function useProductPicker(householdId: string) {
  const [name, setName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [unit, setUnit] = useState('');

  // Debounced: without it, every keystroke fires its own search request
  // against the household's product catalogue.
  const debouncedName = useDebouncedValue(name, 250);
  const search = useSearchProducts(
    householdId,
    selectedProductId ? '' : debouncedName,
  );
  const suggestions =
    !selectedProductId && name.trim() ? (search.data ?? []) : [];

  function changeName(value: string) {
    setSelectedProductId(null);
    setName(value);
  }

  function selectProduct(product: Product) {
    setSelectedProductId(product.id);
    setName(product.name);
    if (product.defaultUnit) setUnit(product.defaultUnit);
  }

  function reset() {
    setName('');
    setSelectedProductId(null);
    setUnit('');
  }

  return {
    name,
    selectedProductId,
    // Exposed alongside selectProduct(): FastAddCard creates a Product on
    // the fly when the user typed a name with no catalogue match, and
    // needs to record that new id as "selected" without a full Product
    // object to hand selectProduct().
    setSelectedProductId,
    unit,
    setUnit,
    suggestions,
    changeName,
    selectProduct,
    reset,
  };
}
