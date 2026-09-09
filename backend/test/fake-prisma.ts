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

interface FakeProduct {
  id: string;
  householdId: string;
  name: string;
  category: string | null;
  defaultUnit: string | null;
  createdAt: Date;
}

interface FakeInventoryItem {
  id: string;
  householdId: string;
  productId: string;
  quantity: number;
  unit: string;
  updatedAt: Date;
}

interface FakeShoppingListItem {
  id: string;
  householdId: string;
  productId: string | null;
  rawLabel: string;
  quantity: number;
  unit: string;
  checked: boolean;
  checkedById: string | null;
  addedById: string | null;
  position: number;
  createdAt: Date;
}

function memberKey(householdId: string, userId: string): string {
  return `${householdId}:${userId}`;
}

// Prisma's real `findUnique`/`update`/`delete` allow extra filter fields
// alongside the unique one ("extended where on unique queries") - this
// mirrors that: `id` must match, and every other present field on `where`
// must also match the row.
function matchesWhere<T extends object>(row: T, where: Partial<T>): boolean {
  return (Object.entries(where) as [keyof T, T[keyof T]][]).every(
    ([key, value]) => row[key] === value,
  );
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
  const productsById = new Map<string, FakeProduct>();
  const inventoryItemsById = new Map<string, FakeInventoryItem>();
  const shoppingListItemsById = new Map<string, FakeShoppingListItem>();

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
      findMany: jest.fn(
        ({ where }: { where: { householdId?: string; userId?: string } }) => {
          const rows = [...membersByKey.values()]
            .filter(
              (member) =>
                (where.householdId === undefined ||
                  member.householdId === where.householdId) &&
                (where.userId === undefined || member.userId === where.userId),
            )
            .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
          return Promise.resolve(
            rows.map((member) => {
              const household = householdsById.get(member.householdId);
              return {
                ...member,
                user: usersById.get(member.userId),
                // Mirrors HouseholdsService.listMine's `select: { id, name }`
                // - real Prisma would omit createdAt here too, and a fake
                // that returned it regardless couldn't catch a select
                // mismatch if the mapping code ever grew to read it.
                household: household && {
                  id: household.id,
                  name: household.name,
                },
              };
            }),
          );
        },
      ),
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
    product: {
      findMany: jest.fn(
        ({
          where,
          orderBy,
          take,
        }: {
          where?: { householdId?: string; name?: { contains: string } };
          orderBy?: { name?: 'asc' | 'desc' };
          take?: number;
        }) => {
          let rows = [...productsById.values()].filter(
            (product) =>
              (where?.householdId === undefined ||
                product.householdId === where.householdId) &&
              (where?.name === undefined ||
                product.name
                  .toLowerCase()
                  .includes(where.name.contains.toLowerCase())),
          );
          if (orderBy?.name) {
            rows = rows.sort((a, b) =>
              orderBy.name === 'desc'
                ? b.name.localeCompare(a.name)
                : a.name.localeCompare(b.name),
            );
          }
          return Promise.resolve(take ? rows.slice(0, take) : rows);
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id: string; householdId?: string } }) => {
          const product = productsById.get(where.id);
          return Promise.resolve(
            product && matchesWhere(product, where) ? product : null,
          );
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            householdId: string;
            name: string;
            category?: string;
            defaultUnit?: string;
          };
        }) => {
          const duplicate = [...productsById.values()].some(
            (product) =>
              product.householdId === data.householdId &&
              product.name === data.name,
          );
          if (duplicate) {
            throw uniqueConstraintError();
          }
          const product: FakeProduct = {
            id: `product-${nextId++}`,
            category: null,
            defaultUnit: null,
            createdAt: new Date(),
            ...data,
          };
          productsById.set(product.id, product);
          return Promise.resolve(product);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; householdId: string };
          data: Partial<FakeProduct>;
        }) => {
          const product = productsById.get(where.id);
          if (!product || !matchesWhere(product, where)) {
            throw recordNotFoundError();
          }
          if (
            data.name !== undefined &&
            [...productsById.values()].some(
              (other) =>
                other.id !== product.id &&
                other.householdId === product.householdId &&
                other.name === data.name,
            )
          ) {
            throw uniqueConstraintError();
          }
          Object.assign(product, data);
          return Promise.resolve(product);
        },
      ),
      delete: jest.fn(
        ({ where }: { where: { id: string; householdId: string } }) => {
          const product = productsById.get(where.id);
          if (!product || !matchesWhere(product, where)) {
            throw recordNotFoundError();
          }
          productsById.delete(product.id);
          // Mirrors the schema's InventoryItem.productId onDelete: Cascade
          // (backend/prisma/schema.prisma) - without this, a deleted
          // product's inventory rows would linger here while real
          // Postgres removes them, letting a test pass against this fake
          // and fail against the real thing.
          for (const item of inventoryItemsById.values()) {
            if (item.productId === product.id) {
              inventoryItemsById.delete(item.id);
            }
          }
          return Promise.resolve(product);
        },
      ),
    },
    inventoryItem: {
      findMany: jest.fn(
        ({
          where,
          include,
        }: {
          where?: { householdId?: string };
          include?: { product?: unknown };
        }) => {
          const rows = [...inventoryItemsById.values()].filter(
            (item) =>
              where?.householdId === undefined ||
              item.householdId === where.householdId,
          );
          return Promise.resolve(
            rows.map((item) => ({
              ...item,
              ...(include?.product
                ? { product: productsById.get(item.productId) }
                : {}),
            })),
          );
        },
      ),
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { id: string; householdId?: string };
          include?: { product?: unknown };
        }) => {
          const item = inventoryItemsById.get(where.id);
          if (!item || !matchesWhere(item, where)) {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            ...item,
            ...(include?.product
              ? { product: productsById.get(item.productId) }
              : {}),
          });
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            householdId: string;
            productId: string;
            quantity: number;
            unit: string;
          };
        }) => {
          const duplicate = [...inventoryItemsById.values()].some(
            (item) =>
              item.householdId === data.householdId &&
              item.productId === data.productId,
          );
          if (duplicate) {
            throw uniqueConstraintError();
          }
          const item: FakeInventoryItem = {
            id: `inventory-${nextId++}`,
            updatedAt: new Date(),
            ...data,
          };
          inventoryItemsById.set(item.id, item);
          return Promise.resolve(item);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; householdId: string };
          data: Partial<FakeInventoryItem>;
        }) => {
          const item = inventoryItemsById.get(where.id);
          if (!item || !matchesWhere(item, where)) {
            throw recordNotFoundError();
          }
          Object.assign(item, data, { updatedAt: new Date() });
          return Promise.resolve(item);
        },
      ),
      delete: jest.fn(
        ({ where }: { where: { id: string; householdId: string } }) => {
          const item = inventoryItemsById.get(where.id);
          if (!item || !matchesWhere(item, where)) {
            throw recordNotFoundError();
          }
          inventoryItemsById.delete(item.id);
          return Promise.resolve(item);
        },
      ),
    },
    shoppingListItem: {
      findMany: jest.fn(
        ({
          where,
          orderBy,
        }: {
          where?: { householdId?: string };
          orderBy?: { position?: 'asc' | 'desc' };
        }) => {
          let rows = [...shoppingListItemsById.values()].filter(
            (item) =>
              where?.householdId === undefined ||
              item.householdId === where.householdId,
          );
          if (orderBy?.position) {
            rows = rows.sort((a, b) =>
              orderBy.position === 'desc'
                ? b.position - a.position
                : a.position - b.position,
            );
          }
          return Promise.resolve(rows);
        },
      ),
      count: jest.fn(({ where }: { where?: { householdId?: string } }) => {
        const count = [...shoppingListItemsById.values()].filter(
          (item) =>
            where?.householdId === undefined ||
            item.householdId === where.householdId,
        ).length;
        return Promise.resolve(count);
      }),
      findUnique: jest.fn(
        ({ where }: { where: { id: string; householdId?: string } }) => {
          const item = shoppingListItemsById.get(where.id);
          return Promise.resolve(
            item && matchesWhere(item, where) ? item : null,
          );
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            householdId: string;
            productId?: string;
            rawLabel: string;
            quantity: number;
            unit: string;
            addedById?: string;
            position: number;
          };
        }) => {
          const item: FakeShoppingListItem = {
            id: `shopping-list-item-${nextId++}`,
            checked: false,
            checkedById: null,
            productId: null,
            addedById: null,
            createdAt: new Date(),
            ...data,
          };
          shoppingListItemsById.set(item.id, item);
          return Promise.resolve(item);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; householdId: string };
          data: Partial<FakeShoppingListItem>;
        }) => {
          const item = shoppingListItemsById.get(where.id);
          if (!item || !matchesWhere(item, where)) {
            throw recordNotFoundError();
          }
          Object.assign(item, data);
          return Promise.resolve(item);
        },
      ),
      delete: jest.fn(
        ({ where }: { where: { id: string; householdId: string } }) => {
          const item = shoppingListItemsById.get(where.id);
          if (!item || !matchesWhere(item, where)) {
            throw recordNotFoundError();
          }
          shoppingListItemsById.delete(item.id);
          return Promise.resolve(item);
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
