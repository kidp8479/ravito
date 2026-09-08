import { randomUUID } from 'crypto';
import {
  householdScopedInventoryItems,
  householdScopedProducts,
} from './../src/common/prisma/household-scoped';
import { PrismaService } from './../src/prisma/prisma.service';

// Runs against a real Postgres (see Makefile `test-integration` / CI's
// `postgres` service). The claim under test - a row from another
// household is genuinely invisible, not just filtered client-side - rests
// on Prisma's "extended where on unique queries" feature actually
// behaving this way against the real query engine, which a mocked
// PrismaService (household-scoped.spec.ts) can't exercise.
describe('household-scoped Prisma helpers (integration)', () => {
  const prisma = new PrismaService();
  let householdIds: string[];

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

  it("a product from household B is invisible through household A's scope", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();

    const productB = await householdScopedProducts(
      prisma,
      householdB.id,
    ).create({ name: 'Lait' });

    await expect(
      householdScopedProducts(prisma, householdA.id).findUnique(productB.id),
    ).resolves.toBeNull();
    await expect(
      householdScopedProducts(prisma, householdB.id).findUnique(productB.id),
    ).resolves.toMatchObject({ id: productB.id });
  });

  it("household A can't update or delete household B's product", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    const productB = await householdScopedProducts(
      prisma,
      householdB.id,
    ).create({ name: 'Lait' });

    await expect(
      householdScopedProducts(prisma, householdA.id).update(productB.id, {
        name: 'Renamed',
      }),
    ).rejects.toThrow();
    await expect(
      householdScopedProducts(prisma, householdA.id).delete(productB.id),
    ).rejects.toThrow();

    await expect(
      householdScopedProducts(prisma, householdB.id).findUnique(productB.id),
    ).resolves.toMatchObject({ name: 'Lait' });
  });

  it("findMany only ever returns the scoped household's products", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    await householdScopedProducts(prisma, householdA.id).create({
      name: 'Pain',
    });
    await householdScopedProducts(prisma, householdB.id).create({
      name: 'Pain',
    });

    const resultsA = await householdScopedProducts(
      prisma,
      householdA.id,
    ).findMany();

    expect(resultsA).toHaveLength(1);
    expect(resultsA[0]).toMatchObject({
      name: 'Pain',
      householdId: householdA.id,
    });
  });

  it("an inventory item from household B is invisible through household A's scope", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    const productB = await householdScopedProducts(
      prisma,
      householdB.id,
    ).create({ name: 'Lait' });
    const itemB = await householdScopedInventoryItems(
      prisma,
      householdB.id,
    ).create({ productId: productB.id, quantity: 2, unit: 'L' });

    await expect(
      householdScopedInventoryItems(prisma, householdA.id).findUnique(itemB.id),
    ).resolves.toBeNull();
    await expect(
      householdScopedInventoryItems(prisma, householdB.id).findUnique(itemB.id),
    ).resolves.toMatchObject({ id: itemB.id });
  });
});
