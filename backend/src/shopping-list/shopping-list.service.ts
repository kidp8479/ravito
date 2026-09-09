import { Injectable, NotFoundException } from '@nestjs/common';
import { ShoppingListItem } from '@prisma/client';
import {
  isForeignKeyError,
  isRecordNotFoundError,
} from '../common/prisma/errors';
import { householdScopedShoppingListItems } from '../common/prisma/household-scoped';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShoppingListItemDto } from './dto/create-shopping-list-item.dto';
import { ShoppingListGateway } from './shopping-list.gateway';
import { UpdateShoppingListItemDto } from './dto/update-shopping-list-item.dto';

@Injectable()
export class ShoppingListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ShoppingListGateway,
  ) {}

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
    let item: ShoppingListItem;
    try {
      item = await scoped.create({ ...dto, addedById, position });
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
    this.gateway.emitCreated(householdId, item);
    return item;
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
    const item = await this.tryUpdate(() =>
      householdScopedShoppingListItems(this.prisma, householdId).update(
        itemId,
        dto,
      ),
    );
    this.gateway.emitUpdated(householdId, item);
    return item;
  }

  async setChecked(
    householdId: string,
    itemId: string,
    userId: string,
    checked: boolean,
  ): Promise<ShoppingListItem> {
    const item = await this.tryUpdate(() =>
      householdScopedShoppingListItems(this.prisma, householdId).setChecked(
        itemId,
        checked,
        checked ? userId : null,
      ),
    );
    this.gateway.emitUpdated(householdId, item);
    return item;
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
    this.gateway.emitDeleted(householdId, itemId);
  }

  // update() and setChecked() both wrap a household-scoped write with the
  // exact same P2025 -> 404 mapping, then emit item.updated - factored out
  // so the "found the row" branch and the socket emit stay written once.
  private async tryUpdate(
    write: () => Promise<ShoppingListItem>,
  ): Promise<ShoppingListItem> {
    try {
      return await write();
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Shopping list item not found');
      }
      throw error;
    }
  }
}
