import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { auth, createHousehold, registerUser } from './e2e-helpers';
import { createFakePrisma } from './fake-prisma';

interface ShoppingListItemBody {
  id: string;
  rawLabel: string;
}
interface InviteBody {
  code: string;
}

// Real socket.io-client connections against a real listening HTTP server
// (not supertest, which can't speak the websocket handshake) - the claim
// under test is genuine wire-level behaviour: a household member's socket
// receives events a REST mutation triggers, a non-member's socket (wrong
// household, or no valid token) never does.
describe('Shopping list real-time (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    server = app.getHttpServer();
    // getUrl() resolves to what app.listen() actually bound to (including
    // the OS-assigned port from listen(0)) - more portable than reading
    // .address() off the underlying http.Server, which getHttpServer()
    // doesn't type consistently across supertest's App generic.
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets.length = 0;
    await app.close();
  });

  function connect(token: string, householdId: string): Socket {
    const socket = io(baseUrl, {
      auth: { token, householdId },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  // The transport-level 'connect' event always fires first (engine.io
  // handshake completes before handleConnection's async membership check
  // even starts) - a rejected connection still briefly "connects" before
  // the server disconnects it a moment later, so the only reliable signal
  // that a connection was rejected is waiting for 'disconnect' itself.
  function waitForDisconnect(socket: Socket): Promise<void> {
    return new Promise((resolve) => socket.once('disconnect', () => resolve()));
  }

  async function setupHouseholdWithTwoMembers() {
    const owner = await registerUser(server, 'owner@example.com');
    const member = await registerUser(server, 'member@example.com');
    const household = await createHousehold(server, owner.accessToken);
    const inviteRes = await request(server)
      .post(`/households/${household.id}/invites`)
      .set(...auth(owner.accessToken))
      .expect(201);
    const { code } = inviteRes.body as InviteBody;
    await request(server)
      .post('/households/join')
      .set(...auth(member.accessToken))
      .send({ code })
      .expect(200);
    return { owner, member, household };
  }

  it('rejects a connection with no valid token', async () => {
    const socket = connect('not-a-real-token', 'h1');
    await expect(waitForDisconnect(socket)).resolves.toBeUndefined();
  });

  it('rejects a connection for a household the caller does not belong to', async () => {
    const alice = await registerUser(server, 'alice@example.com');
    const householdA = await createHousehold(server, alice.accessToken);
    const bob = await registerUser(server, 'bob@example.com');
    await createHousehold(server, bob.accessToken, 'B');

    // Bob has a valid token, but not for household A.
    const socket = connect(bob.accessToken, householdA.id);
    await expect(waitForDisconnect(socket)).resolves.toBeUndefined();
  });

  it('delivers item.created/updated/deleted to a household member, not to an outsider', async () => {
    const { owner, member, household } = await setupHouseholdWithTwoMembers();
    const outsider = await registerUser(server, 'outsider@example.com');
    const outsiderHousehold = await createHousehold(
      server,
      outsider.accessToken,
      'Outsider household',
    );

    const memberSocket = connect(member.accessToken, household.id);
    const outsiderSocket = connect(outsider.accessToken, outsiderHousehold.id);
    await Promise.all([
      waitForEvent(memberSocket, 'connect'),
      waitForEvent(outsiderSocket, 'connect'),
    ]);

    const outsiderGotSomething = jest.fn();
    outsiderSocket.onAny(outsiderGotSomething);

    const createdPromise = waitForEvent<ShoppingListItemBody>(
      memberSocket,
      'item.created',
    );
    const createRes = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);
    const item = createRes.body as ShoppingListItemBody;
    const created = await createdPromise;
    expect(created).toMatchObject({ id: item.id, rawLabel: 'Lait' });

    const updatedPromise = waitForEvent<ShoppingListItemBody>(
      memberSocket,
      'item.updated',
    );
    await request(server)
      .patch(`/households/${household.id}/shopping-list/${item.id}/check`)
      .set(...auth(owner.accessToken))
      .send({ checked: true })
      .expect(200);
    const updated = await updatedPromise;
    expect(updated).toMatchObject({ id: item.id, checked: true });

    const deletedPromise = waitForEvent<{ id: string }>(
      memberSocket,
      'item.deleted',
    );
    await request(server)
      .delete(`/households/${household.id}/shopping-list/${item.id}`)
      .set(...auth(owner.accessToken))
      .expect(204);
    const deleted = await deletedPromise;
    expect(deleted).toEqual({ id: item.id });

    expect(outsiderGotSomething).not.toHaveBeenCalled();
  });
});
