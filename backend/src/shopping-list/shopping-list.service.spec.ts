import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { foreignKeyError, recordNotFoundError } from '../../test/prisma-errors';
import { ShoppingListService } from './shopping-list.service';

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let prisma: {
    product: { findUnique: jest.Mock };
    shoppingListItem: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      shoppingListItem: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShoppingListService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ShoppingListService);
  });

  describe('create', () => {
    it('appends at the current item count as position', async () => {
      prisma.shoppingListItem.count.mockResolvedValue(2);
      prisma.shoppingListItem.create.mockResolvedValue({ id: 'i1' });

      await service.create('h1', 'u1', {
        rawLabel: 'Baguette',
        quantity: 1,
        unit: 'pcs',
      });

      expect(prisma.shoppingListItem.create).toHaveBeenCalledWith({
        data: {
          rawLabel: 'Baguette',
          quantity: 1,
          unit: 'pcs',
          addedById: 'u1',
          position: 2,
          householdId: 'h1',
        },
      });
    });

    it('maps the linked product vanishing mid-request (FK violation) to 404', async () => {
      prisma.shoppingListItem.count.mockResolvedValue(0);
      prisma.shoppingListItem.create.mockRejectedValue(foreignKeyError());

      await expect(
        service.create('h1', 'u1', {
          productId: 'p1',
          rawLabel: 'Lait',
          quantity: 1,
          unit: 'L',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('orders by position ascending', async () => {
      prisma.shoppingListItem.findMany.mockResolvedValue([]);

      await service.list('h1');

      expect(prisma.shoppingListItem.findMany).toHaveBeenCalledWith({
        orderBy: { position: 'asc' },
        where: { householdId: 'h1' },
      });
    });
  });

  describe('update', () => {
    it('maps a missing item to 404', async () => {
      prisma.shoppingListItem.update.mockRejectedValue(recordNotFoundError());

      await expect(
        service.update('h1', 'i1', { quantity: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setChecked', () => {
    it('sets checkedById to the caller when checking', async () => {
      prisma.shoppingListItem.update.mockResolvedValue({ id: 'i1' });

      await service.setChecked('h1', 'i1', 'u1', true);

      expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
        where: { id: 'i1', householdId: 'h1' },
        data: { checked: true, checkedById: 'u1' },
      });
    });

    it('clears checkedById when unchecking', async () => {
      prisma.shoppingListItem.update.mockResolvedValue({ id: 'i1' });

      await service.setChecked('h1', 'i1', 'u1', false);

      expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
        where: { id: 'i1', householdId: 'h1' },
        data: { checked: false, checkedById: null },
      });
    });

    it('maps a missing item to 404', async () => {
      prisma.shoppingListItem.update.mockRejectedValue(recordNotFoundError());

      await expect(
        service.setChecked('h1', 'i1', 'u1', true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('maps a missing item to 404', async () => {
      prisma.shoppingListItem.delete.mockRejectedValue(recordNotFoundError());

      await expect(service.remove('h1', 'i1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
