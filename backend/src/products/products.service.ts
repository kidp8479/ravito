import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Product } from '@prisma/client';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../common/prisma/errors';
import { householdScopedProducts } from '../common/prisma/household-scoped';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateProductDto): Promise<Product> {
    try {
      return await householdScopedProducts(this.prisma, householdId).create(
        dto,
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A product with this name already exists');
      }
      throw error;
    }
  }

  list(householdId: string): Promise<Product[]> {
    return householdScopedProducts(this.prisma, householdId).findMany({
      orderBy: { name: 'asc' },
    });
  }

  // Case-insensitive substring match on name, for the "search catalogue,
  // create at the fly if absent" fast-add flow (PLAN.md).
  search(householdId: string, q: string): Promise<Product[]> {
    return householdScopedProducts(this.prisma, householdId).findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async update(
    householdId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    try {
      return await householdScopedProducts(this.prisma, householdId).update(
        productId,
        dto,
      );
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Product not found');
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A product with this name already exists');
      }
      throw error;
    }
  }

  async remove(householdId: string, productId: string): Promise<void> {
    try {
      await householdScopedProducts(this.prisma, householdId).delete(productId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }
}
