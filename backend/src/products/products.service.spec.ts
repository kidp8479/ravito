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
        orderBy: { name: 'asc' },
        take: 20,
      });
    });
  });
});
