import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HouseholdMembershipGuard } from './household-membership.guard';

describe('HouseholdMembershipGuard', () => {
  let guard: HouseholdMembershipGuard;
  let prisma: { householdMember: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { householdMember: { findUnique: jest.fn() } };
    guard = new HouseholdMembershipGuard(prisma as unknown as PrismaService);
  });

  function contextFor(
    params: Record<string, string>,
    userId: string,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params, user: { sub: userId } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows a request from a member of the target household', async () => {
    prisma.householdMember.findUnique.mockResolvedValue({
      householdId: 'household-1',
      userId: 'user-1',
      role: 'MEMBER',
    });

    await expect(
      guard.canActivate(contextFor({ id: 'household-1' }, 'user-1')),
    ).resolves.toBe(true);
    expect(prisma.householdMember.findUnique).toHaveBeenCalledWith({
      where: {
        householdId_userId: { householdId: 'household-1', userId: 'user-1' },
      },
    });
  });

  it("rejects a non-member with 403, not 404 - existence of the household is not this guard's to reveal", async () => {
    prisma.householdMember.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor({ id: 'household-1' }, 'user-2')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request with no household id in the route', async () => {
    await expect(
      guard.canActivate(contextFor({}, 'user-1')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.householdMember.findUnique).not.toHaveBeenCalled();
  });
});
