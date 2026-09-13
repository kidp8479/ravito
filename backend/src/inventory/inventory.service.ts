import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductCategory } from '@prisma/client';
import {
  isForeignKeyError,
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

const PRODUCT_VIEW_INCLUDE = {
  include: {
    product: {
      select: { id: true, name: true, category: true, defaultUnit: true },
    },
  },
} as const;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    householdId: string,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItemView> {
    const scoped = householdScopedInventoryItems(this.prisma, householdId);
    let itemId: string;
    try {
      itemId = (await scoped.create(dto)).id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This product is already in the inventory - update its quantity instead',
        );
      }
      // The product existed when assertProductInHousehold checked, but
      // was deleted before this insert committed (household-scoped.ts) -
      // functionally the same as "not found".
      if (isForeignKeyError(error)) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
    return this.getView(householdId, itemId);
  }

  // Same shape as create()'s return: a caller that reads item.product off
  // one response shouldn't get a different shape from the other.
  //
  // Ordered by product name, not updatedAt: sorting by updatedAt made an
  // item jump to the top of its category every time its quantity changed
  // (e.g. the +/- steppers on the inventory screen), which is disorienting
  // for a list people scan visually rather than search.
  list(householdId: string): Promise<InventoryItemView[]> {
    return householdScopedInventoryItems(this.prisma, householdId).findMany({
      ...PRODUCT_VIEW_INCLUDE,
      orderBy: { product: { name: 'asc' } },
    });
  }

  async update(
    householdId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemView> {
    try {
      await householdScopedInventoryItems(this.prisma, householdId).update(
        itemId,
        dto,
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Inventory item not found');
      }
      throw error;
    }
    return this.getView(householdId, itemId);
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

  private async getView(
    householdId: string,
    itemId: string,
  ): Promise<InventoryItemView> {
    const item = await householdScopedInventoryItems(
      this.prisma,
      householdId,
    ).findUnique(itemId, PRODUCT_VIEW_INCLUDE);
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    return item;
  }
}
