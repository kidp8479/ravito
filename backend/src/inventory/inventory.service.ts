import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItem, ProductCategory } from '@prisma/client';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../common/prisma/errors';
import { householdScopedInventoryItems } from '../common/prisma/household-scoped';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

export interface InventoryItemView {
  id: string;
  quantity: number;
  unit: string;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    category: ProductCategory | null;
    defaultUnit: string | null;
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    householdId: string,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItem> {
    try {
      return await householdScopedInventoryItems(
        this.prisma,
        householdId,
      ).create(dto);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This product is already in the inventory - update its quantity instead',
        );
      }
      throw error;
    }
  }

  list(householdId: string): Promise<InventoryItemView[]> {
    return householdScopedInventoryItems(this.prisma, householdId).findMany({
      include: {
        product: {
          select: { id: true, name: true, category: true, defaultUnit: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    householdId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    try {
      return await householdScopedInventoryItems(
        this.prisma,
        householdId,
      ).update(itemId, dto);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Inventory item not found');
      }
      throw error;
    }
  }

  async remove(householdId: string, itemId: string): Promise<void> {
    try {
      await householdScopedInventoryItems(this.prisma, householdId).delete(
        itemId,
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Inventory item not found');
      }
      throw error;
    }
  }
}
