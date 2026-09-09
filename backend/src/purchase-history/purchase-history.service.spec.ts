import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { foreignKeyError } from '../../test/prisma-errors';
import { PurchaseHistoryService } from './purchase-history.service';

describe('PurchaseHistoryService', () => {
  let service: PurchaseHistoryService;
  let prisma: {
    product: { findUnique: jest.Mock };
    purchaseHistory: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      purchaseHistory: { findMany: jest.fn(), create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseHistoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PurchaseHistoryService);
  });

  describe('create', () => {
    it('snapshots the product name and defaults purchasedOn to now', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
        name: 'Lait',
      });
      prisma.purchaseHistory.create.mockResolvedValue({ id: 'ph1' });

      const before = new Date();
      const result = await service.create('h1', {
        productId: 'p1',
        quantity: 2,
        unit: 'L',
      });
      const after = new Date();

      expect(result).toEqual({ id: 'ph1' });
      const [{ data }] = prisma.purchaseHistory.create.mock.calls[0] as [
        { data: { purchasedOn: Date; productName: string; unitPrice: null } },
      ];
      expect(data.productName).toBe('Lait');
      expect(data.unitPrice).toBeNull();
      expect(data.purchasedOn.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(data.purchasedOn.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('uses the given purchasedOn and unitPrice when provided', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
        name: 'Lait',
      });
      prisma.purchaseHistory.create.mockResolvedValue({ id: 'ph1' });

      await service.create('h1', {
        productId: 'p1',
        quantity: 2,
        unit: 'L',
        unitPrice: 1.99,
        purchasedOn: '2026-01-01T00:00:00.000Z',
      });

      expect(prisma.purchaseHistory.create).toHaveBeenCalledWith({
        data: {
          productId: 'p1',
          quantity: 2,
          unit: 'L',
          unitPrice: 1.99,
          purchasedOn: new Date('2026-01-01T00:00:00.000Z'),
          householdId: 'h1',
          productName: 'Lait',
        },
      });
    });

    it("404s when the product isn't in this household", async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create('h1', { productId: 'p1', quantity: 2, unit: 'L' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.purchaseHistory.create).not.toHaveBeenCalled();
    });

    it('maps the product vanishing mid-request (FK violation) to 404', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        householdId: 'h1',
        name: 'Lait',
      });
      prisma.purchaseHistory.create.mockRejectedValue(foreignKeyError());

      await expect(
        service.create('h1', { productId: 'p1', quantity: 2, unit: 'L' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('orders by purchasedOn, most recent first, defaulting take to 50', async () => {
      prisma.purchaseHistory.findMany.mockResolvedValue([]);

      await service.list('h1');

      expect(prisma.purchaseHistory.findMany).toHaveBeenCalledWith({
        orderBy: { purchasedOn: 'desc' },
        take: 50,
        where: { householdId: 'h1' },
      });
    });

    it('passes a caller-given limit through as take', async () => {
      prisma.purchaseHistory.findMany.mockResolvedValue([]);

      await service.list('h1', 10);

      expect(prisma.purchaseHistory.findMany).toHaveBeenCalledWith({
        orderBy: { purchasedOn: 'desc' },
        take: 10,
        where: { householdId: 'h1' },
      });
    });
  });
});
