import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken, clearAccessToken } from './auth-store';
import {
  useCreateShoppingListItem,
  useDeleteShoppingListItem,
  useShoppingListItems,
  useShoppingListRealtime,
  type ShoppingListItem,
} from './shopping-list';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

interface MockSocket {
  url: string;
  opts: unknown;
  handlers: Map<string, (data: unknown) => void>;
  disconnect: ReturnType<typeof vi.fn>;
  emit(event: string, data: unknown): void;
}

const sockets: MockSocket[] = [];
const ioMock = vi.fn((url: string, opts: unknown) => {
  const handlers = new Map<string, (data: unknown) => void>();
  const socket: MockSocket = {
    url,
    opts,
    handlers,
    disconnect: vi.fn(),
    emit(event, data) {
      handlers.get(event)?.(data);
    },
  };
  sockets.push(socket);
  return {
    on: (event: string, handler: (data: unknown) => void) =>
      handlers.set(event, handler),
    disconnect: socket.disconnect,
  };
});

vi.mock('socket.io-client', () => ({
  io: (url: string, opts: unknown) => ioMock(url, opts),
}));

function renderWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(callback, { wrapper: Wrapper });
  return { ...result, queryClient };
}

const item: ShoppingListItem = {
  id: 'i1',
  productId: null,
  rawLabel: 'Lait',
  quantity: 1,
  unit: 'L',
  checked: false,
  checkedById: null,
  addedById: 'u1',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const listKey = ['households', 'h1', 'shopping-list'];

const fetchMock = vi.fn();

beforeEach(() => {
  sockets.length = 0;
  ioMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken('token-1');
});

afterEach(() => {
  // @testing-library/react's auto-cleanup relies on a global `afterEach`
  // (globals: true in vitest.config.ts); this project imports test
  // functions explicitly instead, so cleanup() has to be called by hand -
  // otherwise every test's hook stays mounted, its effect keeps reacting
  // to later setAccessToken/clearAccessToken calls, and sockets pile up
  // across tests instead of staying scoped to the test that created them.
  cleanup();
  clearAccessToken();
  vi.unstubAllGlobals();
});

describe('useShoppingListRealtime', () => {
  it('does not connect when there is no household or no access token', () => {
    renderWithClient(() => useShoppingListRealtime(undefined));
    expect(ioMock).not.toHaveBeenCalled();

    clearAccessToken();
    renderWithClient(() => useShoppingListRealtime('h1'));
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('connects with the current access token and householdId', () => {
    renderWithClient(() => useShoppingListRealtime('h1'));

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [, opts] = ioMock.mock.calls[0] as [string, { auth: unknown }];
    expect(opts.auth).toEqual({ token: 'token-1', householdId: 'h1' });
  });

  it('adds a created item to the cache', () => {
    const { queryClient } = renderWithClient(() =>
      useShoppingListRealtime('h1'),
    );
    queryClient.setQueryData(listKey, []);

    sockets[0].emit('item.created', item);

    expect(queryClient.getQueryData(listKey)).toEqual([item]);
  });

  it('does not duplicate an item already in the cache (upsert)', () => {
    const { queryClient } = renderWithClient(() =>
      useShoppingListRealtime('h1'),
    );
    queryClient.setQueryData(listKey, [item]);

    sockets[0].emit('item.created', item);

    expect(queryClient.getQueryData(listKey)).toEqual([item]);
  });

  it('replaces an updated item in place', () => {
    const { queryClient } = renderWithClient(() =>
      useShoppingListRealtime('h1'),
    );
    queryClient.setQueryData(listKey, [item]);

    const updated = { ...item, checked: true };
    sockets[0].emit('item.updated', updated);

    expect(queryClient.getQueryData(listKey)).toEqual([updated]);
  });

  it('removes a deleted item from the cache', () => {
    const { queryClient } = renderWithClient(() =>
      useShoppingListRealtime('h1'),
    );
    queryClient.setQueryData(listKey, [item]);

    sockets[0].emit('item.deleted', { id: item.id });

    expect(queryClient.getQueryData(listKey)).toEqual([]);
  });

  it('re-sorts by position so a reordering event stays in sync', () => {
    const other = { ...item, id: 'i2', position: 1 };
    const { queryClient } = renderWithClient(() =>
      useShoppingListRealtime('h1'),
    );
    queryClient.setQueryData(listKey, [item, other]);

    // item.updated with a higher position than `other` - list should
    // re-sort, not just patch item in place at its old index.
    sockets[0].emit('item.updated', { ...item, position: 2 });

    expect(
      (queryClient.getQueryData(listKey) as ShoppingListItem[]).map(
        (i) => i.id,
      ),
    ).toEqual(['i2', 'i1']);
  });

  it('disconnects the old socket and reconnects when the access token changes', () => {
    const { rerender } = renderWithClient(() => useShoppingListRealtime('h1'));
    expect(sockets).toHaveLength(1);
    const firstSocket = sockets[0];

    setAccessToken('token-2');
    rerender();

    expect(firstSocket.disconnect).toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
    const [, opts] = ioMock.mock.calls[1] as [string, { auth: unknown }];
    expect(opts.auth).toEqual({ token: 'token-2', householdId: 'h1' });
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderWithClient(() => useShoppingListRealtime('h1'));
    const socket = sockets[0];

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('nudges a token refresh after a server-initiated disconnect', () => {
    renderWithClient(() => useShoppingListRealtime('h1'));

    sockets[0].emit('disconnect', 'io server disconnect');

    // refreshAccessToken() is exercised end-to-end in api.test.ts; here we
    // only care that a server-initiated disconnect doesn't just hang
    // forever, which fetch being called proves.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.anything(),
    );
  });

  it('does not refresh after a client-initiated disconnect (e.g. unmount)', () => {
    renderWithClient(() => useShoppingListRealtime('h1'));

    sockets[0].emit('disconnect', 'io client disconnect');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('shopping list REST hooks', () => {
  it('useShoppingListItems fetches the list for the household', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [item]));

    const { result } = renderWithClient(() => useShoppingListItems('h1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([item]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/households/h1/shopping-list');
  });

  it('useCreateShoppingListItem POSTs and upserts the response into the cache', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, item));

    const { result, queryClient } = renderWithClient(() =>
      useCreateShoppingListItem('h1'),
    );
    queryClient.setQueryData(listKey, []);

    await act(async () => {
      await result.current.mutateAsync({
        rawLabel: 'Lait',
        quantity: 1,
        unit: 'L',
      });
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/households/h1/shopping-list');
    expect(init.method).toBe('POST');
    expect(queryClient.getQueryData(listKey)).toEqual([item]);
  });

  it('useDeleteShoppingListItem DELETEs and removes the item from the cache', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));

    const { result, queryClient } = renderWithClient(() =>
      useDeleteShoppingListItem('h1'),
    );
    queryClient.setQueryData(listKey, [item]);

    await act(async () => {
      await result.current.mutateAsync(item.id);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/households/h1/shopping-list/${item.id}`);
    expect(init.method).toBe('DELETE');
    expect(queryClient.getQueryData(listKey)).toEqual([]);
  });
});
