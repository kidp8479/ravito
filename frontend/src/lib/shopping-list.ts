import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, apiFetch, refreshAccessToken } from './api';
import { useAuthState } from './auth';
import {
  useCreateInventoryItem,
  useUpdateInventoryItem,
  type InventoryItem,
} from './inventory';

export interface ShoppingListItem {
  id: string;
  productId: string | null;
  rawLabel: string;
  quantity: number;
  unit: string;
  checked: boolean;
  checkedById: string | null;
  addedById: string | null;
  position: number;
  createdAt: string;
}

const listKey = (householdId: string) => [
  'households',
  householdId,
  'shopping-list',
];

export function useShoppingListItems(householdId: string) {
  return useQuery({
    queryKey: listKey(householdId),
    queryFn: () =>
      apiFetch<ShoppingListItem[]>(`/households/${householdId}/shopping-list`),
  });
}

export function useCreateShoppingListItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productId?: string;
      rawLabel: string;
      quantity: number;
      unit: string;
    }) =>
      apiFetch<ShoppingListItem>(`/households/${householdId}/shopping-list`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (item) =>
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => upsert(old, item),
      ),
  });
}

export function useUpdateShoppingListItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      rawLabel?: string;
      quantity?: number;
      unit?: string;
      position?: number;
    }) =>
      apiFetch<ShoppingListItem>(
        `/households/${householdId}/shopping-list/${id}`,
        { method: 'PATCH', body: input },
      ),
    onSuccess: (item) =>
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => upsert(old, item),
      ),
  });
}

export function useCheckShoppingListItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      apiFetch<ShoppingListItem>(
        `/households/${householdId}/shopping-list/${id}/check`,
        { method: 'PATCH', body: { checked } },
      ),
    onSuccess: (item) =>
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => upsert(old, item),
      ),
  });
}

export function useDeleteShoppingListItem(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/households/${householdId}/shopping-list/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, id) =>
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => removeById(old, id),
      ),
  });
}

// Sorted by position on every write: both the REST mutations above and the
// socket handlers below funnel through this, so a member reordering the
// list (position is a patchable field) keeps everyone's cache in the same
// order without a full refetch.
function upsert(
  items: ShoppingListItem[] | undefined,
  item: ShoppingListItem,
): ShoppingListItem[] {
  const existing = items ?? [];
  const next = existing.some((i) => i.id === item.id)
    ? existing.map((i) => (i.id === item.id ? item : i))
    : [...existing, item];
  return [...next].sort((a, b) => a.position - b.position);
}

function removeById(
  items: ShoppingListItem[] | undefined,
  id: string,
): ShoppingListItem[] | undefined {
  return items?.filter((item) => item.id !== id);
}

// ADR 0003: one socket, auth'd with the current access token + the
// household to watch, re-established whenever that token changes (a
// refresh issues a new one - the old socket's handshake auth can't be
// swapped in place, so it's simpler to just reconnect). Patches the
// TanStack Query cache directly instead of invalidating on every event,
// so a household member sees another member's change without a refetch
// round trip.
export function useShoppingListRealtime(householdId: string | undefined) {
  const auth = useAuthState();
  const queryClient = useQueryClient();
  const accessToken = auth.status === 'authenticated' ? auth.accessToken : null;

  useEffect(() => {
    if (!householdId || !accessToken) return;

    const socket: Socket = io(API_URL, {
      auth: { token: accessToken, householdId },
    });

    socket.on('item.created', (item: ShoppingListItem) => {
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => upsert(old, item),
      );
    });
    socket.on('item.updated', (item: ShoppingListItem) => {
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => upsert(old, item),
      );
    });
    socket.on('item.deleted', ({ id }: { id: string }) => {
      queryClient.setQueryData(
        listKey(householdId),
        (old?: ShoppingListItem[]) => removeById(old, id),
      );
    });

    // The gateway rejects the handshake (client.disconnect(true)) when the
    // token fails verification - socket.io-client does not auto-reconnect
    // after a server-initiated disconnect. Refreshing nudges the auth
    // store to a new token, which re-runs this effect with fresh auth;
    // clearAccessToken() (already called inside a failed refresh) leaves
    // accessToken null and this effect simply stays disconnected instead
    // of retrying forever.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        void refreshAccessToken();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [householdId, accessToken, queryClient]);
}

// PLAN.md's "checked item -> +quantity in inventory" togglable rule.
// productId-linked items only (a free-text item has no product to file
// under). Client-orchestrated the same way FastAddCard already is (check
// the current cache, create or update): a household member checking the
// same item on two devices in the same instant can race two "not in
// inventory yet" reads into two POSTs, one of which 409s - the same class
// of race docs/known-limitations.md already accepts for inventory +/-.
export function useAddCheckedItemToInventory(householdId: string) {
  const createInventory = useCreateInventoryItem(householdId);
  const updateInventory = useUpdateInventoryItem(householdId);

  return useMutation({
    mutationFn: async ({
      item,
      inventory,
    }: {
      item: ShoppingListItem;
      inventory: InventoryItem[];
    }) => {
      if (!item.productId) return;
      const existing = inventory.find((i) => i.product.id === item.productId);
      if (existing) {
        await updateInventory.mutateAsync({
          id: existing.id,
          quantity: existing.quantity + item.quantity,
        });
      } else {
        await createInventory.mutateAsync({
          productId: item.productId,
          quantity: item.quantity,
          unit: item.unit,
        });
      }
    },
  });
}

// Whether the rule above runs automatically on check: a per-device UI
// preference, not household state, so it lives in localStorage rather
// than behind a new backend setting.
const AUTO_ADD_TO_INVENTORY_KEY = 'ravito:autoAddCheckedToInventory';

function readAutoAddToInventory(): boolean {
  try {
    return localStorage.getItem(AUTO_ADD_TO_INVENTORY_KEY) === '1';
  } catch {
    return false;
  }
}

export function useAutoAddToInventorySetting(): [
  boolean,
  (next: boolean) => void,
] {
  const [enabled, setEnabled] = useState(readAutoAddToInventory);

  function set(next: boolean) {
    setEnabled(next);
    try {
      if (next) localStorage.setItem(AUTO_ADD_TO_INVENTORY_KEY, '1');
      else localStorage.removeItem(AUTO_ADD_TO_INVENTORY_KEY);
    } catch {
      // Storage unavailable (private mode, disabled) - the setting just
      // won't survive a reload, no worse than defaulting to off.
    }
  }

  return [enabled, set];
}
