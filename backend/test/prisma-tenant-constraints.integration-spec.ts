import { randomUUID } from 'crypto';
import { useIntegrationPrisma } from './integration-prisma';

// Runs against a real Postgres (see Makefile `test-integration` / CI's
// `postgres` service) - these constraints live in the schema, not in
// application code, so mocking PrismaService (as every other spec does)
// would test nothing here.
describe('Prisma schema tenant constraints (integration)', () => {
  const { prisma, createHousehold } = useIntegrationPrisma();
  let userIds: string[];
  let auditLogIds: string[];

  beforeEach(() => {
    userIds = [];
    auditLogIds = [];
  });

  afterEach(async () => {
    // No ordering constraint between these two, or with the household
    // cleanup useIntegrationPrisma already does: User cascade-deletes
    // HouseholdMember/HouseholdInvite regardless of which side goes
    // first, and AuditLog has no FK to either.
    await Promise.all([
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.auditLog.deleteMany({ where: { id: { in: auditLogIds } } }),
    ]);
  });

  async function createUser(email = `${randomUUID()}@example.test`) {
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x', displayName: 'Test user' },
    });
    userIds.push(user.id);
    return user;
  }

  it('rejects a duplicate (householdId, userId) membership', async () => {
    const household = await createHousehold();
    const user = await createUser();

    await prisma.householdMember.create({
      data: { householdId: household.id, userId: user.id, role: 'OWNER' },
    });

    await expect(
      prisma.householdMember.create({
        data: { householdId: household.id, userId: user.id, role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a membership pointing at a non-existent household', async () => {
    const user = await createUser();

    await expect(
      prisma.householdMember.create({
        data: { householdId: randomUUID(), userId: user.id, role: 'OWNER' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a membership pointing at a non-existent user', async () => {
    const household = await createHousehold();

    await expect(
      prisma.householdMember.create({
        data: {
          householdId: household.id,
          userId: randomUUID(),
          role: 'OWNER',
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades household deletion to its memberships and invites', async () => {
    const household = await createHousehold();
    const user = await createUser();

    await prisma.householdMember.create({
      data: { householdId: household.id, userId: user.id, role: 'OWNER' },
    });
    const invite = await prisma.householdInvite.create({
      data: {
        householdId: household.id,
        code: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: user.id,
      },
    });

    await prisma.household.delete({ where: { id: household.id } });

    await expect(
      prisma.householdMember.findUnique({
        where: {
          householdId_userId: { householdId: household.id, userId: user.id },
        },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.householdInvite.findUnique({ where: { id: invite.id } }),
    ).resolves.toBeNull();
  });

  it('keeps an audit log entry after its actor user is deleted', async () => {
    const user = await createUser();
    const log = await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'household.create',
        entity: 'Household',
        entityId: randomUUID(),
      },
    });
    auditLogIds.push(log.id);

    await prisma.user.delete({ where: { id: user.id } });

    await expect(
      prisma.auditLog.findUnique({ where: { id: log.id } }),
    ).resolves.toMatchObject({ actorUserId: user.id });
  });

  it('keeps a purchase-history entry (with its unitPrice) after its product is deleted, productId set null', async () => {
    const household = await createHousehold();
    const product = await prisma.product.create({
      data: { householdId: household.id, name: 'Lait' },
    });
    const entry = await prisma.purchaseHistory.create({
      data: {
        householdId: household.id,
        productId: product.id,
        productName: product.name,
        purchasedOn: new Date(),
        quantity: 2,
        unit: 'L',
        unitPrice: 1.5,
      },
    });

    await prisma.product.delete({ where: { id: product.id } });

    const survived = await prisma.purchaseHistory.findUnique({
      where: { id: entry.id },
    });
    expect(survived?.productId).toBeNull();
    expect(survived?.productName).toBe('Lait');
    // Prisma's Decimal type round-trips through the pg driver as a
    // Decimal.js instance, not a plain number - toString() is the
    // documented way to compare it without pulling in decimal.js here.
    expect(survived?.unitPrice?.toString()).toBe('1.5');
  });
});
