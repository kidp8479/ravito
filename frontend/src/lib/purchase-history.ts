import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface PurchaseHistoryEntry {
  id: string;
  productId: string | null;
  productName: string;
  purchasedOn: string;
  quantity: number;
  unit: string;
  // A string, not a number: the backend's unitPrice is a Prisma Decimal,
  // which serializes to JSON that way (backend/prisma/schema.prisma).
  unitPrice: string | null;
  source: 'MANUAL' | 'RECEIPT';
}

const purchaseHistoryKey = (householdId: string) => [
  'households',
  householdId,
  'purchase-history',
];

export function usePurchaseHistory(householdId: string) {
  return useQuery({
    queryKey: purchaseHistoryKey(householdId),
    queryFn: () =>
      apiFetch<PurchaseHistoryEntry[]>(
        `/households/${householdId}/purchase-history`,
      ),
  });
}

export function useLogPurchase(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productId: string;
      quantity: number;
      unit: string;
      unitPrice?: number;
      purchasedOn?: string;
    }) =>
      apiFetch<PurchaseHistoryEntry>(
        `/households/${householdId}/purchase-history`,
        { method: 'POST', body: input },
      ),
    // No realtime channel for purchase history (unlike the shopping list,
    // RAV-14) - a plain invalidate is the simplest correct option, same
    // as inventory.ts/households.ts.
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: purchaseHistoryKey(householdId),
      }),
  });
}
