import { NotFoundException } from '@nestjs/common';
import {
  householdScopedInventoryItems,
  householdScopedProducts,
  householdScopedShoppingListItems,
} from './household-scoped';
import { PrismaService } from '../../prisma/prisma.service';

// Plain jest.fn() properties, deliberately untyped as PrismaService here:
// only the cast passed into the helpers below (asPrisma) claims that type,
// so assertions against these mocks stay plain function references instead
// of tripping @typescript-eslint/unbound-method on a "class method".
function fakePrisma() {
  return {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inventoryItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingListItem: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function asPrisma(mocks: ReturnType<typeof fakePrisma>): PrismaService {
  return mocks as unknown as PrismaService;
}

describe('householdScopedProducts', () => {
  it('merges householdId into findMany, keeping other where fields', () => {
    const mocks = fakePrisma();
    void householdScopedProducts(asPrisma(mocks), 'h1').findMany({
      where: { name: 'Lait' },
    });

    expect(mocks.product.findMany).toHaveBeenCalledWith({
      where: { name: 'Lait', householdId: 'h1' },
    });
  });

  it('scopes findUnique by id and householdId together', () => {
    const mocks = fakePrisma();
    void householdScopedProducts(asPrisma(mocks), 'h1').findUnique('p1');

    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'h1' },
    });
  });

  it('injects householdId on create', () => {
    const mocks = fakePrisma();
    void householdScopedProducts(asPrisma(mocks), 'h1').create({
      name: 'Lait',
    });

    expect(mocks.product.create).toHaveBeenCalledWith({
      data: { name: 'Lait', householdId: 'h1' },
    });
  });

  it('scopes update and delete by id and householdId', () => {
    const mocks = fakePrisma();
    const scoped = householdScopedProducts(asPrisma(mocks), 'h1');

    void scoped.update('p1', { name: 'Lait demi-ecreme' });
    expect(mocks.product.update).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'h1' },
      data: { name: 'Lait demi-ecreme' },
    });

    void scoped.delete('p1');
    expect(mocks.product.delete).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'h1' },
    });
  });
});

describe('householdScopedInventoryItems', () => {
  it('merges householdId into findMany, keeping other where fields', () => {
    const mocks = fakePrisma();
    void householdScopedInventoryItems(asPrisma(mocks), 'h1').findMany({
      where: { productId: 'p1' },
    });

    expect(mocks.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { productId: 'p1', householdId: 'h1' },
    });
  });

  it('injects householdId on create, after confirming the product is in this household', async () => {
    const mocks = fakePrisma();
    mocks.product.findUnique.mockResolvedValue({ id: 'p1', householdId: 'h1' });

    await householdScopedInventoryItems(asPrisma(mocks), 'h1').create({
      productId: 'p1',
      quantity: 2,
      unit: 'L',
    });

    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'h1' },
    });
    expect(mocks.inventoryItem.create).toHaveBeenCalledWith({
      data: { productId: 'p1', quantity: 2, unit: 'L', householdId: 'h1' },
    });
  });

  it("rejects create when the product isn't in this household", async () => {
    const mocks = fakePrisma();
    mocks.product.findUnique.mockResolvedValue(null);

    await expect(
      householdScopedInventoryItems(asPrisma(mocks), 'h1').create({
        productId: 'other-households-product',
        quantity: 2,
        unit: 'L',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mocks.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('scopes update and delete by id and householdId', () => {
    const mocks = fakePrisma();
    const scoped = householdScopedInventoryItems(asPrisma(mocks), 'h1');

    void scoped.update('i1', { quantity: 3 });
    expect(mocks.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'i1', householdId: 'h1' },
      data: { quantity: 3 },
    });

    void scoped.delete('i1');
    expect(mocks.inventoryItem.delete).toHaveBeenCalledWith({
      where: { id: 'i1', householdId: 'h1' },
    });
  });
});

describe('householdScopedShoppingListItems', () => {
  it('merges householdId into findMany and count', () => {
    const mocks = fakePrisma();
    const scoped = householdScopedShoppingListItems(asPrisma(mocks), 'h1');

    void scoped.findMany({ orderBy: { position: 'asc' } });
    expect(mocks.shoppingListItem.findMany).toHaveBeenCalledWith({
      orderBy: { position: 'asc' },
      where: { householdId: 'h1' },
    });

    void scoped.count();
    expect(mocks.shoppingListItem.count).toHaveBeenCalledWith({
      where: { householdId: 'h1' },
    });
  });

  it('creates a free-text item (no productId) without checking any product', async () => {
    const mocks = fakePrisma();
    await householdScopedShoppingListItems(asPrisma(mocks), 'h1').create({
      rawLabel: 'Baguette',
      quantity: 2,
      unit: 'pcs',
      addedById: 'u1',
      position: 0,
    });

    expect(mocks.product.findUnique).not.toHaveBeenCalled();
    expect(mocks.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        rawLabel: 'Baguette',
        quantity: 2,
        unit: 'pcs',
        addedById: 'u1',
        position: 0,
        householdId: 'h1',
      },
    });
  });

  it('creates a catalogue-linked item after confirming the product is in this household', async () => {
    const mocks = fakePrisma();
    mocks.product.findUnique.mockResolvedValue({ id: 'p1', householdId: 'h1' });

    await householdScopedShoppingListItems(asPrisma(mocks), 'h1').create({
      productId: 'p1',
      rawLabel: 'Lait',
      quantity: 1,
      unit: 'L',
      addedById: 'u1',
      position: 0,
    });

    expect(mocks.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'h1' },
    });
    expect(mocks.shoppingListItem.create).toHaveBeenCalled();
  });

  it("rejects create when the linked product isn't in this household", async () => {
    const mocks = fakePrisma();
    mocks.product.findUnique.mockResolvedValue(null);

    await expect(
      householdScopedShoppingListItems(asPrisma(mocks), 'h1').create({
        productId: 'other-households-product',
        rawLabel: 'Lait',
        quantity: 1,
        unit: 'L',
        addedById: 'u1',
        position: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mocks.shoppingListItem.create).not.toHaveBeenCalled();
  });

  it('scopes update, setChecked and delete by id and householdId', () => {
    const mocks = fakePrisma();
    const scoped = householdScopedShoppingListItems(asPrisma(mocks), 'h1');

    void scoped.update('i1', { quantity: 3 });
    expect(mocks.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'i1', householdId: 'h1' },
      data: { quantity: 3 },
    });

    void scoped.setChecked('i1', true, 'u1');
    expect(mocks.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'i1', householdId: 'h1' },
      data: { checked: true, checkedById: 'u1' },
    });

    void scoped.delete('i1');
    expect(mocks.shoppingListItem.delete).toHaveBeenCalledWith({
      where: { id: 'i1', householdId: 'h1' },
    });
  });
});
