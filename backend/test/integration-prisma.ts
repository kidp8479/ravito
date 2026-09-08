import { randomUUID } from 'crypto';
import { PrismaService } from './../src/prisma/prisma.service';

// Shared setup for *.integration-spec.ts files (real Postgres, see
// Makefile `test-integration` / CI's `postgres` service): a live
// PrismaService plus household creation/cleanup, the part every one of
// these specs needs regardless of what else it's testing. Call this
// inside a `describe` block - it registers Jest's before/after hooks
// itself, the same as calling them directly would.
export function useIntegrationPrisma() {
  const prisma = new PrismaService();
  let householdIds: string[] = [];

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  beforeEach(() => {
    householdIds = [];
  });

  afterEach(async () => {
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
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

  return { prisma, createHousehold };
}
