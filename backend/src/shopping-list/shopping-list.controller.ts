import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ShoppingListItem } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CheckShoppingListItemDto } from './dto/check-shopping-list-item.dto';
import { CreateShoppingListItemDto } from './dto/create-shopping-list-item.dto';
import { UpdateShoppingListItemDto } from './dto/update-shopping-list-item.dto';
import { ShoppingListService } from './shopping-list.service';

@UseGuards(JwtAuthGuard, HouseholdMembershipGuard)
@Controller('households/:id/shopping-list')
export class ShoppingListController {
  constructor(private readonly shoppingList: ShoppingListService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('id') householdId: string,
    @CurrentUser() userId: string,
    @Body() dto: CreateShoppingListItemDto,
  ): Promise<ShoppingListItem> {
    return this.shoppingList.create(householdId, userId, dto);
  }

  @Get()
  list(@Param('id') householdId: string): Promise<ShoppingListItem[]> {
    return this.shoppingList.list(householdId);
  }

  @Patch(':itemId')
  update(
    @Param('id') householdId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateShoppingListItemDto,
  ): Promise<ShoppingListItem> {
    return this.shoppingList.update(householdId, itemId, dto);
  }

  @Patch(':itemId/check')
  setChecked(
    @Param('id') householdId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() userId: string,
    @Body() dto: CheckShoppingListItemDto,
  ): Promise<ShoppingListItem> {
    return this.shoppingList.setChecked(
      householdId,
      itemId,
      userId,
      dto.checked,
    );
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') householdId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.shoppingList.remove(householdId, itemId);
  }
}
