import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Runs against a real Postgres (see Makefile `test-integration` / CI's
// `postgres` service) - these constraints live in the schema, not in
// application code, so mocking PrismaService (as every other spec does)
// would test nothing here.
describe('Prisma schema tenant constraints (integration)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createHousehold() {
    return prisma.household.create({
      data: { name: `Household ${randomUUID()}` },
    });
  }

  async function createUser() {
    return prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'x',
        displayName: 'Test user',
      },
    });
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

  it('rejects a membership pointing at a non-existent household or user', async () => {
    const user = await createUser();

    await expect(
      prisma.householdMember.create({
        data: { householdId: randomUUID(), userId: user.id, role: 'OWNER' },
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

    await prisma.user.delete({ where: { id: user.id } });

    await expect(
      prisma.auditLog.findUnique({ where: { id: log.id } }),
    ).resolves.toMatchObject({ actorUserId: user.id });
  });
});
