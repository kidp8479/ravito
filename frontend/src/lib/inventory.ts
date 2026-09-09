import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type ProductCategory =
  | 'FRUITS_AND_VEGETABLES'
  | 'DAIRY'
  | 'MEAT_AND_FISH'
  | 'BAKERY'
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
  });
}

export function useCreateProduct(householdId: string) {
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Product>(`/households/${householdId}/products`, {
        method: 'POST',
        body: { name },
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
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      apiFetch<InventoryItem>(`/households/${householdId}/inventory/${id}`, {
        method: 'PATCH',
        body: { quantity },
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
