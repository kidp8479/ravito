import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseHistory } from '@prisma/client';
import { isForeignKeyError } from '../common/prisma/errors';
import { householdScopedPurchaseHistory } from '../common/prisma/household-scoped';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseHistoryDto } from './dto/create-purchase-history.dto';

@Injectable()
export class PurchaseHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    householdId: string,
    dto: CreatePurchaseHistoryDto,
  ): Promise<PurchaseHistory> {
    try {
      return await householdScopedPurchaseHistory(
        this.prisma,
        householdId,
      ).create({
        productId: dto.productId,
        purchasedOn: dto.purchasedOn ? new Date(dto.purchasedOn) : new Date(),
        quantity: dto.quantity,
        unit: dto.unit,
        unitPrice: dto.unitPrice ?? null,
      });
    } catch (error) {
      // The product existed when assertProductInHousehold checked
      // (household-scoped.ts), but was deleted before this insert
      // committed - same race InventoryService.create() closes (RAV-11).
      if (isForeignKeyError(error)) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  // Defaults to 50, capped at 200 (ListPurchaseHistoryDto) - an
  // append-only log has no natural upper bound on row count, unlike this
  // codebase's other list endpoints (catalogue/inventory/shopping-list),
  // whose size stays bounded by how many distinct products exist.
  list(householdId: string, limit = 50): Promise<PurchaseHistory[]> {
    return householdScopedPurchaseHistory(this.prisma, householdId).findMany({
      orderBy: { purchasedOn: 'desc' },
      take: limit,
    });
  }
}
