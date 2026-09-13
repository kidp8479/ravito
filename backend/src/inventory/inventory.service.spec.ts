import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  foreignKeyError,
  recordNotFoundError,
  uniqueConstraintError,
} from '../../test/prisma-errors';
import { InventoryService } from './inventory.service';

const VIEW_INCLUDE = {
  include: {
    product: {
      select: { id: true, name: true, category: true, defaultUnit: true },
    },
  },
};

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    product: { findUnique: jest.Mock };
    inventoryItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      inventoryItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  describe('create', () => {
    it('creates an item and returns it joined with its product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
      });
      prisma.inventoryItem.create.mockResolvedValue({ id: 'i1' });
      const view = { id: 'i1', quantity: 2, unit: 'L', product: { id: 'p1' } };
      prisma.inventoryItem.findUnique.mockResolvedValue(view);

      const result = await service.create('h1', {
        productId: 'p1',
        quantity: 2,
        unit: 'L',
      });

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith({
        data: { productId: 'p1', quantity: 2, unit: 'L', householdId: 'h1' },
      });
      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({
        ...VIEW_INCLUDE,
        where: { id: 'i1', householdId: 'h1' },
      });
      expect(result).toEqual(view);
    });

    it("404s when the product isn't in this household", async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create('h1', { productId: 'p1', quantity: 2, unit: 'L' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate (household, product) to 409', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
      });
      prisma.inventoryItem.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.create('h1', { productId: 'p1', quantity: 2, unit: 'L' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps the product vanishing mid-request (FK violation) to 404', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
      });
      prisma.inventoryItem.create.mockRejectedValue(foreignKeyError());

      await expect(
        service.create('h1', { productId: 'p1', quantity: 2, unit: 'L' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('includes the joined product on every item', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list('h1');

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
        include: {
          product: {
            select: { id: true, name: true, category: true, defaultUnit: true },
          },
        },
        orderBy: { product: { name: 'asc' } },
        where: { householdId: 'h1' },
      });
    });
  });

  describe('update', () => {
    it('updates and returns the item joined with its product', async () => {
      prisma.inventoryItem.update.mockResolvedValue({ id: 'i1' });
      const view = { id: 'i1', quantity: 5, unit: 'L', product: { id: 'p1' } };
      prisma.inventoryItem.findUnique.mockResolvedValue(view);

      const result = await service.update('h1', 'i1', { quantity: 5 });

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'i1', householdId: 'h1' },
        data: { quantity: 5 },
      });
      expect(result).toEqual(view);
    });

    it('maps a missing item to 404', async () => {
      prisma.inventoryItem.update.mockRejectedValue(recordNotFoundError());

      await expect(
        service.update('h1', 'i1', { quantity: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('maps a missing item to 404', async () => {
      prisma.inventoryItem.delete.mockRejectedValue(recordNotFoundError());

      await expect(service.remove('h1', 'i1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
