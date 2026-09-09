import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchaseHistory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CreatePurchaseHistoryDto } from './dto/create-purchase-history.dto';
import { ListPurchaseHistoryDto } from './dto/list-purchase-history.dto';
import { PurchaseHistoryService } from './purchase-history.service';

@UseGuards(JwtAuthGuard, HouseholdMembershipGuard)
@Controller('households/:id/purchase-history')
export class PurchaseHistoryController {
  constructor(private readonly purchaseHistory: PurchaseHistoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('id') householdId: string,
    @Body() dto: CreatePurchaseHistoryDto,
  ): Promise<PurchaseHistory> {
    return this.purchaseHistory.create(householdId, dto);
  }

  @Get()
  list(
    @Param('id') householdId: string,
    @Query() query: ListPurchaseHistoryDto,
  ): Promise<PurchaseHistory[]> {
    return this.purchaseHistory.list(householdId, query.limit);
  }
}
