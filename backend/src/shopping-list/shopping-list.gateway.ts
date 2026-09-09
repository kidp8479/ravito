import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ShoppingListItem } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { isHouseholdMember } from '../common/household-membership';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

// ADR 0003: one gateway, rooms keyed by householdId. Auth happens once on
// connect (not per-message): the client sends its access token and the
// householdId it wants to watch in the Socket.IO handshake `auth` payload
// - never a header, since the browser Socket.IO client controls that
// payload directly, unlike a cookie a caller can't easily attach to a
// non-HTTP connection. Membership is re-checked against the DB here, the
// same as HouseholdMembershipGuard does for REST (isHouseholdMember,
// common/household-membership.ts) - never trusted from what the client
// merely claims to want to join.
function householdRoom(householdId: string): string {
  return `household:${householdId}`;
}

interface HandshakeAuth {
  token?: string;
  householdId?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class ShoppingListGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ShoppingListGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const { token, householdId } = client.handshake.auth as HandshakeAuth;
    if (!token || !householdId) {
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      userId = payload.sub;
    } catch {
      client.disconnect(true);
      return;
    }

    if (!(await isHouseholdMember(this.prisma, householdId, userId))) {
      client.disconnect(true);
      return;
    }

    await client.join(householdRoom(householdId));
    this.logger.debug(
      `Socket ${client.id} joined ${householdRoom(householdId)}`,
    );
  }

  emitCreated(householdId: string, item: ShoppingListItem): void {
    this.server.to(householdRoom(householdId)).emit('item.created', item);
  }

  emitUpdated(householdId: string, item: ShoppingListItem): void {
    this.server.to(householdRoom(householdId)).emit('item.updated', item);
  }

  emitDeleted(householdId: string, itemId: string): void {
    this.server
      .to(householdRoom(householdId))
      .emit('item.deleted', { id: itemId });
  }
}
