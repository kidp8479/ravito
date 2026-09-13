import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type ProductCategory =
  | 'FRUITS_AND_VEGETABLES'
  | 'DAIRY'
  | 'MEAT_AND_FISH'
  | 'BAKERY'
  | 'PASTA_RICE_AND_GRAINS'
  | 'CANNED_AND_JARRED'
  | 'SAUCES_OILS_AND_CONDIMENTS'
  | 'SPICES_AND_HERBS'
  | 'BAKING'
  | 'SNACKS_AND_DRIED_GOODS'
  | 'PANTRY'
  | 'FROZEN'
  | 'BEVERAGES'
  | 'HOUSEHOLD_AND_HYGIENE'
  | 'OTHER';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory | null;
  defaultUnit: string | null;
}

// Shared between the inventory grouping view and any product-editing UI
// (FastAddCard, InventoryRow) so the enum's labels/order are defined once.
export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'FRUITS_AND_VEGETABLES',
  'DAIRY',
  'MEAT_AND_FISH',
  'BAKERY',
  'PASTA_RICE_AND_GRAINS',
  'CANNED_AND_JARRED',
  'SAUCES_OILS_AND_CONDIMENTS',
  'SPICES_AND_HERBS',
  'BAKING',
  'SNACKS_AND_DRIED_GOODS',
  'PANTRY',
  'FROZEN',
  'BEVERAGES',
  'HOUSEHOLD_AND_HYGIENE',
  'OTHER',
];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  FRUITS_AND_VEGETABLES: 'Fruits & Vegetables',
  DAIRY: 'Dairy',
  MEAT_AND_FISH: 'Meat & Fish',
  BAKERY: 'Bakery',
  PASTA_RICE_AND_GRAINS: 'Pasta, Rice & Grains',
  CANNED_AND_JARRED: 'Canned & Jarred',
  SAUCES_OILS_AND_CONDIMENTS: 'Sauces, Oils & Condiments',
  SPICES_AND_HERBS: 'Spices & Herbs',
  BAKING: 'Baking',
  SNACKS_AND_DRIED_GOODS: 'Snacks & Dried Goods',
  PANTRY: 'Pantry',
  FROZEN: 'Frozen',
  BEVERAGES: 'Beverages',
  HOUSEHOLD_AND_HYGIENE: 'Household & Hygiene',
  OTHER: 'Other',
};

export interface InventoryItem {
  id: string;
  quantity: number;
  unit: string;
  updatedAt: string;
  product: Product;
}

const inventoryKey = (householdId: string) => [
  'households',
  householdId,
  'inventory',
];
const searchKey = (householdId: string, q: string) => [
  'households',
  householdId,
  'products',
  'search',
  q,
];

export function useSearchProducts(householdId: string, q: string) {
  return useQuery({
    queryKey: searchKey(householdId, q),
    queryFn: () =>
      apiFetch<Product[]>(
        `/households/${householdId}/products/search?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length > 0,
    // One distinct cache entry per keystroke, worth nothing once typing
    // moves on - excluded from persistence (meta.persist, lib/main.tsx's
    // shouldDehydrateQuery) and kept to the pre-RAV-19 default gcTime
    // rather than the household-data default that lib/query-client.ts
    // now raises to 24h, so this doesn't linger in memory or bloat the
    // persisted localStorage blob all day.
    gcTime: 5 * 60 * 1000,
    meta: { persist: false },
  });
}

export function useCreateProduct(householdId: string) {
  return useMutation({
    mutationFn: (input: { name: string; category?: ProductCategory }) =>
      apiFetch<Product>(`/households/${householdId}/products`, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useUpdateProduct(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      category?: ProductCategory;
    }) =>
      apiFetch<Product>(`/households/${householdId}/products/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: inventoryKey(householdId),
      }),
  });
}

export function useInventoryItems(householdId: string) {
  return useQuery({
    queryKey: inventoryKey(householdId),
    queryFn: () =>
      apiFetch<InventoryItem[]>(`/households/${householdId}/inventory`),
  });
}

export function useCreateInventoryItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productId: string;
      quantity: number;
      unit: string;
    }) =>
      apiFetch<InventoryItem>(`/households/${householdId}/inventory`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: inventoryKey(householdId),
      }),
  });
}

export function useUpdateInventoryItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      quantity?: number;
      unit?: string;
    }) =>
      apiFetch<InventoryItem>(`/households/${householdId}/inventory/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: inventoryKey(householdId),
      }),
  });
}

export function useDeleteInventoryItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/households/${householdId}/inventory/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: inventoryKey(householdId),
      }),
  });
}
