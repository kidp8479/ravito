import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, apiFetch, refreshAccessToken } from './api';
import { useAuthState } from './auth';

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
