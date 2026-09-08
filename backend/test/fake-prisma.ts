// Minimal in-memory stand-in for PrismaService, scoped to what the e2e
// specs touch (User, RefreshToken, Household, HouseholdMember,
// HouseholdInvite). Lets e2e specs exercise real controller -> service
// wiring without a real database, matching the "PrismaService is mocked
// in every e2e spec" convention (see docs/known-limitations.md >
// "test:integration is a third Jest tier").

import { recordNotFoundError, uniqueConstraintError } from './prisma-errors';

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}

interface FakeRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

interface FakeHousehold {
  id: string;
  name: string;
  createdAt: Date;
}

interface FakeHouseholdMember {
  householdId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: Date;
}

interface FakeHouseholdInvite {
  id: string;
  householdId: string;
  code: string;
  expiresAt: Date;
  createdById: string;
  consumedAt: Date | null;
}

function memberKey(householdId: string, userId: string): string {
  return `${householdId}:${userId}`;
}

export function createFakePrisma() {
  let nextId = 1;
  const usersById = new Map<string, FakeUser>();
  const usersByEmail = new Map<string, FakeUser>();
  const tokensById = new Map<string, FakeRefreshToken>();
  const tokensByHash = new Map<string, FakeRefreshToken>();
  const householdsById = new Map<string, FakeHousehold>();
  const membersByKey = new Map<string, FakeHouseholdMember>();
  const invitesById = new Map<string, FakeHouseholdInvite>();
  const invitesByCode = new Map<string, FakeHouseholdInvite>();

  const client = {
    user: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.email)
            return Promise.resolve(usersByEmail.get(where.email) ?? null);
          if (where.id) return Promise.resolve(usersById.get(where.id) ?? null);
          return Promise.resolve(null);
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: Pick<FakeUser, 'email' | 'passwordHash' | 'displayName'>;
        }) => {
          const user: FakeUser = {
            id: `user-${nextId++}`,
            createdAt: new Date(),
            ...data,
          };
          usersById.set(user.id, user);
          usersByEmail.set(user.email, user);
          return Promise.resolve(user);
        },
      ),
    },
    refreshToken: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Pick<FakeRefreshToken, 'userId' | 'tokenHash' | 'expiresAt'>;
        }) => {
          const token: FakeRefreshToken = {
            id: `rt-${nextId++}`,
            revokedAt: null,
            replacedByTokenId: null,
            ...data,
          };
          tokensById.set(token.id, token);
          tokensByHash.set(token.tokenHash, token);
          return Promise.resolve(token);
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; tokenHash?: string } }) => {
          if (where.tokenHash) {
            return Promise.resolve(tokensByHash.get(where.tokenHash) ?? null);
          }
          if (where.id)
            return Promise.resolve(tokensById.get(where.id) ?? null);
          return Promise.resolve(null);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeRefreshToken>;
        }) => {
          const token = tokensById.get(where.id);
          if (!token) throw new Error(`no refresh token ${where.id}`);
          Object.assign(token, data);
          return Promise.resolve(token);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            userId?: string;
            tokenHash?: string;
            revokedAt: null;
          };
          data: Partial<FakeRefreshToken>;
        }) => {
          let count = 0;
          for (const token of tokensById.values()) {
            const matches =
              token.revokedAt === where.revokedAt &&
              (where.userId === undefined || token.userId === where.userId) &&
              (where.tokenHash === undefined ||
                token.tokenHash === where.tokenHash);
            if (matches) {
              Object.assign(token, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
    household: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            name: string;
            members: { create: { userId: string; role: 'OWNER' | 'MEMBER' } };
          };
        }) => {
          const household: FakeHousehold = {
            id: `household-${nextId++}`,
            name: data.name,
            createdAt: new Date(),
          };
          householdsById.set(household.id, household);

          const member: FakeHouseholdMember = {
            householdId: household.id,
            userId: data.members.create.userId,
            role: data.members.create.role,
            joinedAt: new Date(),
          };
          membersByKey.set(
            memberKey(member.householdId, member.userId),
            member,
          );

          return Promise.resolve(household);
        },
      ),
    },
    householdMember: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            householdId: string;
            userId: string;
            role: 'OWNER' | 'MEMBER';
          };
        }) => {
          const key = memberKey(data.householdId, data.userId);
          if (membersByKey.has(key)) {
            throw uniqueConstraintError();
          }
          const member: FakeHouseholdMember = { ...data, joinedAt: new Date() };
          membersByKey.set(key, member);
          return Promise.resolve(member);
        },
      ),
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            householdId_userId: { householdId: string; userId: string };
          };
        }) => {
          const { householdId, userId } = where.householdId_userId;
          return Promise.resolve(
            membersByKey.get(memberKey(householdId, userId)) ?? null,
          );
        },
      ),
      findMany: jest.fn(({ where }: { where: { householdId: string } }) => {
        const rows = [...membersByKey.values()]
          .filter((member) => member.householdId === where.householdId)
          .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
        return Promise.resolve(
          rows.map((member) => ({
            ...member,
            user: usersById.get(member.userId),
          })),
        );
      }),
      count: jest.fn(
        ({
          where,
        }: {
          where: {
            householdId: string;
            role?: 'OWNER' | 'MEMBER';
            userId?: { not: string };
          };
        }) => {
          const count = [...membersByKey.values()].filter(
            (member) =>
              member.householdId === where.householdId &&
              (where.role === undefined || member.role === where.role) &&
              (where.userId === undefined ||
                member.userId !== where.userId.not),
          ).length;
          return Promise.resolve(count);
        },
      ),
      delete: jest.fn(
        ({
          where,
        }: {
          where: {
            householdId_userId: { householdId: string; userId: string };
          };
        }) => {
          const { householdId, userId } = where.householdId_userId;
          const key = memberKey(householdId, userId);
          const member = membersByKey.get(key);
          if (!member) {
            throw recordNotFoundError();
          }
          membersByKey.delete(key);
          return Promise.resolve(member);
        },
      ),
    },
    householdInvite: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            householdId: string;
            createdById: string;
            code: string;
            expiresAt: Date;
          };
        }) => {
          const invite: FakeHouseholdInvite = {
            id: `invite-${nextId++}`,
            consumedAt: null,
            ...data,
          };
          invitesById.set(invite.id, invite);
          invitesByCode.set(invite.code, invite);
          return Promise.resolve(invite);
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { code?: string; id?: string } }) => {
          if (where.code)
            return Promise.resolve(invitesByCode.get(where.code) ?? null);
          if (where.id)
            return Promise.resolve(invitesById.get(where.id) ?? null);
          return Promise.resolve(null);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; consumedAt: null };
          data: Partial<FakeHouseholdInvite>;
        }) => {
          const invite = invitesById.get(where.id);
          if (!invite || invite.consumedAt !== where.consumedAt) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(invite, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };

  return {
    ...client,
    // No real transactional semantics (no rollback) - good enough for
    // what the e2e specs exercise (the successful path and the
    // "already a member" branch); real atomicity is Postgres's job,
    // proven by the integration tier instead.
    $transaction: jest.fn(<T>(callback: (tx: typeof client) => Promise<T>) =>
      callback(client),
    ),
  };
}
