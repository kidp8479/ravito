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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Product } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { SearchProductsDto } from './dto/search-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard, HouseholdMembershipGuard)
@Controller('households/:id/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('id') householdId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.products.create(householdId, dto);
  }

  @Get()
  list(@Param('id') householdId: string): Promise<Product[]> {
    return this.products.list(householdId);
  }

  // Registered before ':productId' - Nest matches routes in declaration
  // order, so 'search' would otherwise be swallowed as a :productId value.
  @Get('search')
  search(
    @Param('id') householdId: string,
    @Query() query: SearchProductsDto,
  ): Promise<Product[]> {
    return this.products.search(householdId, query.q);
  }

  @Patch(':productId')
  update(
    @Param('id') householdId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.products.update(householdId, productId, dto);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') householdId: string,
    @Param('productId') productId: string,
  ): Promise<void> {
    return this.products.remove(householdId, productId);
  }
}
