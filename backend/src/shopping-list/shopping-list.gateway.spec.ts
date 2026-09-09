import { ShoppingListGateway } from './shopping-list.gateway';

function fakeSocket(auth: Record<string, unknown>) {
  return {
    id: 'socket-1',
    handshake: { auth },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ShoppingListGateway', () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { householdMember: { findUnique: jest.Mock } };
  let gateway: ShoppingListGateway;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    prisma = { householdMember: { findUnique: jest.fn() } };
    gateway = new ShoppingListGateway(jwt as never, prisma as never);
  });

  describe('handleConnection', () => {
    it('disconnects when the token or householdId is missing', async () => {
      const socket = fakeSocket({ token: 'x' }); // no householdId

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('disconnects when the token fails verification', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
      const socket = fakeSocket({ token: 'bad', householdId: 'h1' });

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it("disconnects when the caller isn't a member of the requested household", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
      prisma.householdMember.findUnique.mockResolvedValue(null);
      const socket = fakeSocket({ token: 'good', householdId: 'h1' });

      await gateway.handleConnection(socket as never);

      expect(prisma.householdMember.findUnique).toHaveBeenCalledWith({
        where: { householdId_userId: { householdId: 'h1', userId: 'u1' } },
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the household room on a valid, member-verified connection', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
      prisma.householdMember.findUnique.mockResolvedValue({
        householdId: 'h1',
        userId: 'u1',
        role: 'OWNER',
      });
      const socket = fakeSocket({ token: 'good', householdId: 'h1' });

      await gateway.handleConnection(socket as never);

      expect(socket.join).toHaveBeenCalledWith('household:h1');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('emit methods', () => {
    function fakeServer() {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      return { to, emit };
    }

    it('emits item.created/updated/deleted to the household room only', () => {
      const server = fakeServer();
      gateway.server = server as never;

      gateway.emitCreated('h1', { id: 'i1' } as never);
      gateway.emitUpdated('h1', { id: 'i1' } as never);
      gateway.emitDeleted('h1', 'i1');

      expect(server.to).toHaveBeenCalledWith('household:h1');
      expect(server.to).toHaveBeenCalledTimes(3);
      expect(server.emit).toHaveBeenNthCalledWith(1, 'item.created', {
        id: 'i1',
      });
      expect(server.emit).toHaveBeenNthCalledWith(2, 'item.updated', {
        id: 'i1',
      });
      expect(server.emit).toHaveBeenNthCalledWith(3, 'item.deleted', {
        id: 'i1',
      });
    });
  });
});
