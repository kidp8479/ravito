import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdsService } from './households.service';

// jest's `expect.any` is typed as returning `any`, which trips
// @typescript-eslint/no-unsafe-assignment wherever it lands in a typed
// object literal below - narrows the type back down instead (same
// pattern as auth.service.spec.ts).
function matchAny<T>(ctor: new (...args: never[]) => T): T {
  return expect.any(ctor) as T;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

describe('HouseholdsService', () => {
  let service: HouseholdsService;
  let prisma: {
    household: { create: jest.Mock };
    householdMember: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    householdInvite: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      household: { create: jest.fn() },
      householdMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      householdInvite: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(HouseholdsService);
  });

  describe('create', () => {
    it('creates the household with the caller as OWNER', async () => {
      prisma.household.create.mockResolvedValue({ id: 'h1', name: 'Casa' });

      const result = await service.create('user-1', 'Casa');

      expect(prisma.household.create).toHaveBeenCalledWith({
        data: {
          name: 'Casa',
          members: { create: { userId: 'user-1', role: 'OWNER' } },
        },
      });
      expect(result).toEqual({ id: 'h1', name: 'Casa' });
    });
  });

  describe('joinByCode', () => {
    const invite = {
      id: 'invite-1',
      householdId: 'h1',
      code: 'abc123',
      expiresAt: new Date(Date.now() + 1000),
      consumedAt: null,
      createdById: 'user-1',
    };

    it('claims the invite and adds the caller as a MEMBER', async () => {
      prisma.householdInvite.findUnique.mockResolvedValue(invite);

      const result = await service.joinByCode('user-2', 'abc123');

      expect(prisma.householdInvite.updateMany).toHaveBeenCalledWith({
        where: { id: invite.id, consumedAt: null },
        data: { consumedAt: matchAny(Date) },
      });
      expect(prisma.householdMember.create).toHaveBeenCalledWith({
        data: { householdId: 'h1', userId: 'user-2', role: 'MEMBER' },
      });
      expect(result).toEqual({ householdId: 'h1' });
    });

    it('rejects an unknown code', async () => {
      prisma.householdInvite.findUnique.mockResolvedValue(null);

      await expect(service.joinByCode('user-2', 'nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an expired code', async () => {
      prisma.householdInvite.findUnique.mockResolvedValue({
        ...invite,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.joinByCode('user-2', 'abc123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a code already claimed by a concurrent join', async () => {
      prisma.householdInvite.findUnique.mockResolvedValue(invite);
      prisma.householdInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.joinByCode('user-2', 'abc123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.householdMember.create).not.toHaveBeenCalled();
    });

    it('treats already being a member as success, not an error', async () => {
      prisma.householdInvite.findUnique.mockResolvedValue(invite);
      prisma.householdMember.create.mockRejectedValue(p2002());

      const result = await service.joinByCode('user-2', 'abc123');

      expect(result).toEqual({ householdId: 'h1' });
    });
  });

  describe('removeMember', () => {
    it('allows a member to remove themself without checking their role', async () => {
      await service.removeMember('h1', 'user-1', 'user-1');

      expect(prisma.householdMember.findUnique).not.toHaveBeenCalled();
      expect(prisma.householdMember.delete).toHaveBeenCalledWith({
        where: { householdId_userId: { householdId: 'h1', userId: 'user-1' } },
      });
    });

    it('allows an OWNER to remove another member', async () => {
      prisma.householdMember.findUnique.mockResolvedValue({ role: 'OWNER' });

      await service.removeMember('h1', 'owner-1', 'user-2');

      expect(prisma.householdMember.delete).toHaveBeenCalledWith({
        where: { householdId_userId: { householdId: 'h1', userId: 'user-2' } },
      });
    });

    it('rejects a non-OWNER trying to remove someone else', async () => {
      prisma.householdMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.removeMember('h1', 'member-1', 'user-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.householdMember.delete).not.toHaveBeenCalled();
    });

    it('404s when the target is not actually a member', async () => {
      prisma.householdMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.householdMember.delete.mockRejectedValue(p2025());

      await expect(
        service.removeMember('h1', 'owner-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
