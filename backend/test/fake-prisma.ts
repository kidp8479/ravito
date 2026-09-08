// Minimal in-memory stand-in for PrismaService, scoped to what the auth
// e2e flow touches (User, RefreshToken). Lets the auth e2e spec exercise
// real controller -> service wiring without a real database, matching the
// "PrismaService is mocked in every e2e spec" convention (see
// docs/known-limitations.md > "test:integration is a third Jest tier").

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

export function createFakePrisma() {
  let nextId = 1;
  const usersById = new Map<string, FakeUser>();
  const usersByEmail = new Map<string, FakeUser>();
  const tokensById = new Map<string, FakeRefreshToken>();
  const tokensByHash = new Map<string, FakeRefreshToken>();

  return {
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
  };
}
