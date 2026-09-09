import type { Product } from '@/lib/inventory';

// Shared between FastAddCard (inventory) and AddShoppingListItemCard
// (shopping list): both let the user type a name and pick a matching
// product from the household's catalogue instead of typing blind.
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

export { ProductSuggestions };
