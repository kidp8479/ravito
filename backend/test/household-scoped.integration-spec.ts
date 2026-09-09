import {
  householdScopedInventoryItems,
  householdScopedProducts,
  householdScopedShoppingListItems,
} from './../src/common/prisma/household-scoped';
import { useIntegrationPrisma } from './integration-prisma';

// Runs against a real Postgres (see Makefile `test-integration` / CI's
// `postgres` service). The claims under test - a row from another
// household is genuinely invisible, not just filtered client-side, and a
// create() can't be pointed at another household's row via a crafted
// foreign key - rest on real Prisma/Postgres behaviour that a mocked
// PrismaService (household-scoped.spec.ts) can't exercise.
describe('household-scoped Prisma helpers (integration)', () => {
  const { prisma, createHousehold } = useIntegrationPrisma();

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

  it("rejects creating an inventory item against another household's product", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    const productB = await householdScopedProducts(
      prisma,
      householdB.id,
    ).create({ name: 'Lait' });

    await expect(
      householdScopedInventoryItems(prisma, householdA.id).create({
        productId: productB.id,
        quantity: 2,
        unit: 'L',
      }),
    ).rejects.toThrow();
  });

  it("a shopping list item from household B is invisible through household A's scope", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    const itemB = await householdScopedShoppingListItems(
      prisma,
      householdB.id,
    ).create({ rawLabel: 'Lait', quantity: 1, unit: 'L', position: 0 });

    await expect(
      householdScopedShoppingListItems(prisma, householdA.id).findUnique(
        itemB.id,
      ),
    ).resolves.toBeNull();
    await expect(
      householdScopedShoppingListItems(prisma, householdB.id).findUnique(
        itemB.id,
      ),
    ).resolves.toMatchObject({ id: itemB.id });
  });

  it("rejects creating a shopping list item against another household's product", async () => {
    const householdA = await createHousehold();
    const householdB = await createHousehold();
    const productB = await householdScopedProducts(
      prisma,
      householdB.id,
    ).create({ name: 'Lait' });

    await expect(
      householdScopedShoppingListItems(prisma, householdA.id).create({
        productId: productB.id,
        rawLabel: 'Lait',
        quantity: 1,
        unit: 'L',
        position: 0,
      }),
    ).rejects.toThrow();
  });

  it('allows a shopping list item with no productId (free text)', async () => {
    const household = await createHousehold();

    const item = await householdScopedShoppingListItems(
      prisma,
      household.id,
    ).create({ rawLabel: 'Baguette', quantity: 1, unit: 'pcs', position: 0 });

    expect(item.productId).toBeNull();
  });
});
