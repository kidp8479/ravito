import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

// The non-negotiable tenant boundary (CLAUDE.md): every mutating and
// read route on a household resource runs this after JwtAuthGuard (which
// sets req.user) - never trusts a client-supplied role/id, always
// re-checks membership against the DB for the :id in the URL.
@Injectable()
export class HouseholdMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const householdId = req.params.id;
    if (typeof householdId !== 'string' || householdId.length === 0) {
      throw new BadRequestException('Missing household id');
    }

    // Defensive, not redundant: this guard is meant to be reused by every
    // future domain module (common.module.ts), and unlike a check within
    // one file's own control flow, "always paired with JwtAuthGuard" is a
    // convention a future module could get wrong. Failing that as a 401
    // is a lot better than the uncaught TypeError an unchecked cast would
    // throw instead.
    const userId = (req.user as JwtPayload | undefined)?.sub;
    if (!userId) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const membership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });

    // 403, not 404: whether the household exists at all is not this
    // guard's business to reveal to someone who isn't a member of it.
    if (!membership) {
      throw new ForbiddenException('Not a member of this household');
    }

    return true;
  }
}
