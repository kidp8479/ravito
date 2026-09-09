import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  recordNotFoundError,
  uniqueConstraintError,
} from '../../test/prisma-errors';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    purchaseHistory: { groupBy: jest.Mock };
    shoppingListItem: { groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseHistory: { groupBy: jest.fn().mockResolvedValue([]) },
      shoppingListItem: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('create', () => {
    it('creates a product scoped to the household', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p1', name: 'Lait' });

      const result = await service.create('h1', { name: 'Lait' });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: { name: 'Lait', householdId: 'h1' },
      });
      expect(result).toEqual({ id: 'p1', name: 'Lait' });
    });

    it('maps a duplicate name to 409', async () => {
      prisma.product.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.create('h1', { name: 'Lait' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('maps a missing product to 404', async () => {
      prisma.product.update.mockRejectedValue(recordNotFoundError());

      await expect(
        service.update('h1', 'p1', { name: 'Lait' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a rename clash to 409', async () => {
      prisma.product.update.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.update('h1', 'p1', { name: 'Pain' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('maps a missing product to 404', async () => {
      prisma.product.delete.mockRejectedValue(recordNotFoundError());

      await expect(service.remove('h1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('searches by a case-insensitive substring on name', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.search('h1', 'lait');

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          name: { contains: 'lait', mode: 'insensitive' },
          householdId: 'h1',
        },
      });
    });

    it('does not query frequency at all when nothing matched', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.search('h1', 'xyz');

      expect(prisma.purchaseHistory.groupBy).not.toHaveBeenCalled();
      expect(prisma.shoppingListItem.groupBy).not.toHaveBeenCalled();
    });

    it('ranks by combined purchase + shopping-list add frequency, most first', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Lait' },
        { id: 'p2', name: 'Pain' },
        { id: 'p3', name: 'Riz' },
      ]);
      prisma.purchaseHistory.groupBy.mockResolvedValue([
        { productId: 'p1', _count: { productId: 3 } },
        { productId: 'p3', _count: { productId: 1 } },
      ]);
      prisma.shoppingListItem.groupBy.mockResolvedValue([
        { productId: 'p2', _count: { productId: 5 } },
        { productId: 'p1', _count: { productId: 1 } },
      ]);

      const result = await service.search('h1', 'a');

      // p1: 3 + 1 = 4, p2: 0 + 5 = 5, p3: 1 + 0 = 1
      expect(result.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
      expect(prisma.purchaseHistory.groupBy).toHaveBeenCalledWith({
        by: ['productId'],
        where: { householdId: 'h1', productId: { in: ['p1', 'p2', 'p3'] } },
        _count: { productId: true },
      });
    });

    it('falls back to alphabetical order when frequencies tie', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p2', name: 'Riz' },
        { id: 'p1', name: 'Lait' },
      ]);

      const result = await service.search('h1', 'a');

      expect(result.map((p) => p.name)).toEqual(['Lait', 'Riz']);
    });

    it('caps results at 20 after ranking, not before', async () => {
      const products = Array.from({ length: 25 }, (_, i) => ({
        id: `p${i}`,
        name: `Product ${i}`,
      }));
      prisma.product.findMany.mockResolvedValue(products);
      // The 25th product (alphabetically last) is by far the most
      // frequently added - it must still make the top 20.
      prisma.purchaseHistory.groupBy.mockResolvedValue([
        { productId: 'p24', _count: { productId: 100 } },
      ]);

      const result = await service.search('h1', 'product');

      expect(result).toHaveLength(20);
      expect(result[0].id).toBe('p24');
    });
  });
});
