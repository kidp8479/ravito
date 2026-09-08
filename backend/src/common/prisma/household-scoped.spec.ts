import { NotFoundException } from '@nestjs/common';
import {
  householdScopedInventoryItems,
  householdScopedProducts,
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
