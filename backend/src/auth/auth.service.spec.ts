import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { uniqueConstraintError } from '../../test/prisma-errors';
import { AuthService } from './auth.service';

// jest's own types make `expect.any`/`expect.objectContaining` return
// `any`, which trips `@typescript-eslint/no-unsafe-assignment` wherever
// the result lands in a typed object literal below. These narrow the
// return type back down instead of sprinkling inline `as unknown as X`.
function matchAny<T>(ctor: new (...args: never[]) => T): T {
  return expect.any(ctor) as T;
}
function matchObjectContaining<T extends object>(partial: Partial<T>): T {
  return expect.objectContaining(partial) as T;
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const user = {
    id: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    createdAt: new Date('2026-01-01'),
    passwordHash: '',
  };

  beforeEach(async () => {
    user.passwordHash = await argon2.hash('correct-password');

    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        // Default to "won the atomic claim" - the happy path for
        // refresh(); tests for the losing/reuse branch override this.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('normalizes the email, hashes the password, and issues tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const tokens = await service.register({
        email: 'Alice@Example.com',
        password: 'a-strong-password',
        displayName: 'Alice',
      });

      // Guards against a regression that drops `.toLowerCase()` from just
      // one of the two places email is read/written: the uniqueness check
      // itself has to run against the normalized email too, or
      // 'Alice@x.com' and 'alice@x.com' could both slip past it.
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        matchObjectContaining({
          data: matchObjectContaining({ email: 'alice@example.com' }),
        }),
      );
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects a duplicate email with a 409, not a silent success', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.register({
          email: user.email,
          password: 'a-strong-password',
          displayName: 'Alice',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a concurrent duplicate insert (P2002) with a 409, not an unhandled 500', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.register({
          email: user.email,
          password: 'a-strong-password',
          displayName: 'Alice',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues tokens for a matching email/password pair', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const tokens = await service.login({
        email: user.email,
        password: 'correct-password',
      });

      expect(tokens.accessToken).toBeDefined();
    });

    it('normalizes the email before looking the user up', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await service.login({
        email: 'Alice@Example.com',
        password: 'correct-password',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
    });

    it('rejects a wrong password with a generic error', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same generic error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@example.com',
          password: 'whatever',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates a valid token: issues a new pair and revokes the old one', async () => {
      const stored = {
        id: 'refresh-1',
        userId: user.id,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      };
      prisma.refreshToken.findUnique.mockResolvedValue(stored);
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-2' });

      const tokens = await service.refresh('raw-refresh-token');

      expect(tokens.accessToken).toBeDefined();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: matchAny(Date) },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: stored.id },
        data: { replacedByTokenId: 'refresh-2' },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('not-a-real-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('treats a reused (already-revoked) token as theft and revokes the chain', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: user.id,
        tokenHash: 'hash',
        revokedAt: null, // as far as the initial read knows
        expiresAt: new Date(Date.now() + 1000),
      });
      // The atomic claim below is what actually detects reuse: this
      // token was already revoked by the time it's attempted, so the
      // conditional update matches nothing.
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('stolen-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: matchAny(Date) },
      });
    });

    it('treats losing the rotation race against a concurrent refresh the same way', async () => {
      // Two requests presenting the *same still-valid* token both reach
      // the atomic claim; only one can win it (see the comment in
      // AuthService.refresh). This is that race's loser.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: user.id,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('raced-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: user.id,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching, still-active refresh token', async () => {
      await service.logout('raw-refresh-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: matchAny(String), revokedAt: null },
        data: { revokedAt: matchAny(Date) },
      });
    });
  });

  describe('getPublicUser', () => {
    it('never includes the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const publicUser = await service.getPublicUser(user.id);

      expect(publicUser).toEqual({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      });
    });
  });
});
