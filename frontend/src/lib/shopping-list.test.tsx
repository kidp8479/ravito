import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken, clearAccessToken } from './auth-store';
import {
  useShoppingListRealtime,
  type ShoppingListItem,
} from './shopping-list';

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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderWithClient(householdId: string | undefined) {
  const queryClient = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(() => useShoppingListRealtime(householdId), {
    wrapper: Wrapper,
  });
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

beforeEach(() => {
  sockets.length = 0;
  ioMock.mockClear();
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
});

describe('useShoppingListRealtime', () => {
  it('does not connect when there is no household or no access token', () => {
    renderWithClient(undefined);
    expect(ioMock).not.toHaveBeenCalled();

    clearAccessToken();
    renderWithClient('h1');
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('connects with the current access token and householdId', () => {
    renderWithClient('h1');

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [, opts] = ioMock.mock.calls[0] as [string, { auth: unknown }];
    expect(opts.auth).toEqual({ token: 'token-1', householdId: 'h1' });
  });

  it('adds a created item to the cache', () => {
    const { queryClient } = renderWithClient('h1');
    queryClient.setQueryData(listKey, []);

    sockets[0].emit('item.created', item);

    expect(queryClient.getQueryData(listKey)).toEqual([item]);
  });

  it('does not duplicate an item already in the cache (upsert)', () => {
    const { queryClient } = renderWithClient('h1');
    queryClient.setQueryData(listKey, [item]);

    sockets[0].emit('item.created', item);

    expect(queryClient.getQueryData(listKey)).toEqual([item]);
  });

  it('replaces an updated item in place', () => {
    const { queryClient } = renderWithClient('h1');
    queryClient.setQueryData(listKey, [item]);

    const updated = { ...item, checked: true };
    sockets[0].emit('item.updated', updated);

    expect(queryClient.getQueryData(listKey)).toEqual([updated]);
  });

  it('removes a deleted item from the cache', () => {
    const { queryClient } = renderWithClient('h1');
    queryClient.setQueryData(listKey, [item]);

    sockets[0].emit('item.deleted', { id: item.id });

    expect(queryClient.getQueryData(listKey)).toEqual([]);
  });

  it('disconnects the old socket and reconnects when the access token changes', () => {
    const queryClient = new QueryClient();
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { rerender } = renderHook(() => useShoppingListRealtime('h1'), {
      wrapper: Wrapper,
    });
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
    const { unmount } = renderHook(() => useShoppingListRealtime('h1'), {
      wrapper,
    });
    const socket = sockets[0];

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });
});
