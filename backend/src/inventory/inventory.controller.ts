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
import { InventoryItem } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemView, InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, HouseholdMembershipGuard)
@Controller('households/:id/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('id') householdId: string,
    @Body() dto: CreateInventoryItemDto,
  ): Promise<InventoryItem> {
    return this.inventory.create(householdId, dto);
  }

  @Get()
  list(@Param('id') householdId: string): Promise<InventoryItemView[]> {
    return this.inventory.list(householdId);
  }

  @Patch(':itemId')
  update(
    @Param('id') householdId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    return this.inventory.update(householdId, itemId, dto);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') householdId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    return this.inventory.remove(householdId, itemId);
  }
}
