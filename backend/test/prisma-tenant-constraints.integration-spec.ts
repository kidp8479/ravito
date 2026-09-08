import { randomUUID } from 'crypto';
import { PrismaService } from './../src/prisma/prisma.service';

// Runs against a real Postgres (see Makefile `test-integration` / CI's
// `postgres` service) - these constraints live in the schema, not in
// application code, so mocking PrismaService (as every other spec does)
// would test nothing here.
describe('Prisma schema tenant constraints (integration)', () => {
  const prisma = new PrismaService();
  let householdIds: string[];
  let userIds: string[];
  let auditLogIds: string[];

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  beforeEach(() => {
    householdIds = [];
    userIds = [];
    auditLogIds = [];
  });

  afterEach(async () => {
    // No ordering constraint between these three: Household/User both
    // cascade-delete HouseholdMember/HouseholdInvite regardless of which
    // side is deleted first, and AuditLog has no FK to either.
    await Promise.all([
      prisma.household.deleteMany({ where: { id: { in: householdIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.auditLog.deleteMany({ where: { id: { in: auditLogIds } } }),
    ]);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function createHousehold() {
    const household = await prisma.household.create({
      data: { name: `Household ${randomUUID()}` },
    });
    householdIds.push(household.id);
    return household;
  }

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
});
