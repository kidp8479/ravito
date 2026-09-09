import { Injectable, NotFoundException } from '@nestjs/common';
import { ShoppingListItem } from '@prisma/client';
import {
  isForeignKeyError,
  isRecordNotFoundError,
} from '../common/prisma/errors';
import { householdScopedShoppingListItems } from '../common/prisma/household-scoped';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShoppingListItemDto } from './dto/create-shopping-list-item.dto';
import { UpdateShoppingListItemDto } from './dto/update-shopping-list-item.dto';

@Injectable()
export class ShoppingListService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    householdId: string,
    addedById: string,
    dto: CreateShoppingListItemDto,
  ): Promise<ShoppingListItem> {
    const scoped = householdScopedShoppingListItems(this.prisma, householdId);
    // Appended to the end of the list; a plain count-based position can
    // tie under concurrent creates, which is fine (schema comment: no
    // uniqueness constraint, ties are fine for a manual-reorder list).
    const position = await scoped.count();
    try {
      return await scoped.create({ ...dto, addedById, position });
    } catch (error) {
      // The linked product existed when assertProductInHousehold checked
      // (household-scoped.ts), but was deleted before this insert
      // committed - same race InventoryService.create() closes (RAV-11),
      // missed here at first. Functionally the same as "not found".
      if (isForeignKeyError(error)) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  list(householdId: string): Promise<ShoppingListItem[]> {
    return householdScopedShoppingListItems(this.prisma, householdId).findMany({
      orderBy: { position: 'asc' },
    });
  }

  async update(
    householdId: string,
    itemId: string,
    dto: UpdateShoppingListItemDto,
  ): Promise<ShoppingListItem> {
    try {
      return await householdScopedShoppingListItems(
        this.prisma,
        householdId,
      ).update(itemId, dto);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Shopping list item not found');
      }
      throw error;
    }
  }

  async setChecked(
    householdId: string,
    itemId: string,
    userId: string,
    checked: boolean,
  ): Promise<ShoppingListItem> {
    try {
      return await householdScopedShoppingListItems(
        this.prisma,
        householdId,
      ).setChecked(itemId, checked, checked ? userId : null);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Shopping list item not found');
      }
      throw error;
    }
  }

  async remove(householdId: string, itemId: string): Promise<void> {
    try {
      await householdScopedShoppingListItems(this.prisma, householdId).delete(
        itemId,
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Shopping list item not found');
      }
      throw error;
    }
  }
}
