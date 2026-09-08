import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdRole } from '@prisma/client';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../common/prisma/errors';
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

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lets the frontend rediscover the caller's household(s) on a fresh
  // session (new device, cleared storage) instead of relying on a
  // client-stored householdId, which a create/join response alone can't
  // survive.
  async listMine(userId: string): Promise<HouseholdSummary[]> {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId },
      include: { household: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.household.id,
      name: membership.household.name,
      role: membership.role,
    }));
  }

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

    // Same transaction as the membership create below: claiming the
    // invite (consumedAt) and adding the member have to commit or fail
    // together, or a transient DB error on the create would permanently
    // burn the invite without the user ever actually joining.
    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the invite before creating the membership: a
      // plain read-then-write here would let two concurrent joins with
      // the same code both pass a `consumedAt === null` check (same
      // reasoning as AuthService.refresh's rotation, RAV-6).
      const { count } = await tx.householdInvite.updateMany({
        where: { id: invite.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (count === 0) {
        throw new BadRequestException('Invalid or expired invite code');
      }

      try {
        await tx.householdMember.create({
          data: { householdId: invite.householdId, userId, role: 'MEMBER' },
        });
      } catch (error) {
        // Already a member (rejoining with a second invite, or a race
        // with another invite to the same household) - the invite still
        // did its job, no need to fail the request over it.
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }

      return { householdId: invite.householdId };
    });
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
    if (callerId === targetUserId) {
      await this.assertCanLeave(householdId, callerId);
    } else {
      await this.assertCanRemoveSomeoneElse(householdId, callerId);
    }

    try {
      await this.prisma.householdMember.delete({
        where: { householdId_userId: { householdId, userId: targetUserId } },
      });
    } catch (error) {
      if (!isRecordNotFoundError(error)) {
        throw error;
      }
      throw new NotFoundException('Membership not found');
    }
  }

  private async assertCanRemoveSomeoneElse(
    householdId: string,
    callerId: string,
  ): Promise<void> {
    const callerMembership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: callerId } },
    });
    if (callerMembership?.role !== 'OWNER') {
      throw new ForbiddenException('Only an OWNER can remove another member');
    }
  }

  // Leaving is normally unconditional, but the *last* OWNER leaving while
  // other members remain would orphan them - no one left able to remove
  // or manage anyone (there's no ownership transfer yet). A lone OWNER
  // with no one else in the household can still leave freely; the
  // household just sits empty. Multiple OWNERs (once promotion exists)
  // can always leave, since another one remains.
  private async assertCanLeave(
    householdId: string,
    callerId: string,
  ): Promise<void> {
    const callerMembership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: callerId } },
    });
    if (callerMembership?.role !== 'OWNER') {
      return;
    }

    const [otherMembers, otherOwners] = await Promise.all([
      this.prisma.householdMember.count({
        where: { householdId, userId: { not: callerId } },
      }),
      this.prisma.householdMember.count({
        where: { householdId, role: 'OWNER', userId: { not: callerId } },
      }),
    ]);
    if (otherMembers > 0 && otherOwners === 0) {
      throw new ForbiddenException(
        'The last OWNER cannot leave while other members remain; remove them first',
      );
    }
  }
}
