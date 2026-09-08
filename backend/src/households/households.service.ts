import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INVITE_TOKEN_TTL_MS } from './households.constants';

export interface HouseholdInvite {
  code: string;
  expiresAt: Date;
}

export interface HouseholdMemberView {
  userId: string;
  role: HouseholdRole;
  joinedAt: Date;
  email: string;
  displayName: string;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ownerId: string,
    name: string,
  ): Promise<{ id: string; name: string }> {
    const household = await this.prisma.household.create({
      data: { name, members: { create: { userId: ownerId, role: 'OWNER' } } },
    });
    return { id: household.id, name: household.name };
  }

  async createInvite(
    householdId: string,
    createdById: string,
  ): Promise<HouseholdInvite> {
    const invite = await this.prisma.householdInvite.create({
      data: {
        householdId,
        createdById,
        code: randomBytes(9).toString('base64url'), // 12 chars, URL-safe
        expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
      },
    });
    return { code: invite.code, expiresAt: invite.expiresAt };
  }

  async joinByCode(
    userId: string,
    code: string,
  ): Promise<{ householdId: string }> {
    const invite = await this.prisma.householdInvite.findUnique({
      where: { code },
    });
    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invite code');
    }

    // Atomically claim the invite before creating the membership: a plain
    // read-then-write here would let two concurrent joins with the same
    // code both pass a `consumedAt === null` check (same reasoning as
    // AuthService.refresh's rotation, RAV-6).
    const { count } = await this.prisma.householdInvite.updateMany({
      where: { id: invite.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException('Invalid or expired invite code');
    }

    try {
      await this.prisma.householdMember.create({
        data: { householdId: invite.householdId, userId, role: 'MEMBER' },
      });
    } catch (error) {
      // Already a member (rejoining with a second invite, or a race with
      // another invite to the same household) - the invite still did its
      // job, no need to fail the request over it.
      const alreadyMember =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!alreadyMember) {
        throw error;
      }
    }

    return { householdId: invite.householdId };
  }

  async listMembers(householdId: string): Promise<HouseholdMemberView[]> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((member) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      email: member.user.email,
      displayName: member.user.displayName,
    }));
  }

  async removeMember(
    householdId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<void> {
    if (callerId !== targetUserId) {
      const callerMembership = await this.prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId: callerId } },
      });
      if (callerMembership?.role !== 'OWNER') {
        throw new ForbiddenException('Only an OWNER can remove another member');
      }
    }

    try {
      await this.prisma.householdMember.delete({
        where: { householdId_userId: { householdId, userId: targetUserId } },
      });
    } catch (error) {
      const notFound =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025';
      if (!notFound) {
        throw error;
      }
      throw new NotFoundException('Membership not found');
    }
  }
}
