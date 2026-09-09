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
  // create at the fly if absent" fast-add flow (PLAN.md). Ranked by how
  // often the product has actually been added (RAV-18: "you often rebuy
  // this") - a PurchaseHistory entry or a shopping-list item both count
  // as "added", summed. Not capped at the DB query: the top-20 has to be
  // chosen by frequency, not alphabetically-then-cut, so every match is
  // fetched and ranked in application code before slicing.
  async search(householdId: string, q: string): Promise<Product[]> {
    const products = await householdScopedProducts(
      this.prisma,
      householdId,
    ).findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
    });
    if (products.length === 0) return products;

    const productIds = products.map((product) => product.id);
    const frequency = await this.addFrequency(householdId, productIds);

    return products
      .sort((a, b) => {
        const byFrequency =
          (frequency.get(b.id) ?? 0) - (frequency.get(a.id) ?? 0);
        return byFrequency !== 0 ? byFrequency : a.name.localeCompare(b.name);
      })
      .slice(0, 20);
  }

  // How many times each product was added: a PurchaseHistory entry, or a
  // shopping-list item linked to it (checked or not - being put on the
  // list at all is itself a signal, same as a purchase).
  private async addFrequency(
    householdId: string,
    productIds: string[],
  ): Promise<Map<string, number>> {
    const [purchases, listItems] = await Promise.all([
      this.prisma.purchaseHistory.groupBy({
        by: ['productId'],
        where: { householdId, productId: { in: productIds } },
        _count: { productId: true },
      }),
      this.prisma.shoppingListItem.groupBy({
        by: ['productId'],
        where: { householdId, productId: { in: productIds } },
        _count: { productId: true },
      }),
    ]);

    const frequency = new Map<string, number>();
    for (const row of [...purchases, ...listItems]) {
      if (!row.productId) continue;
      frequency.set(
        row.productId,
        (frequency.get(row.productId) ?? 0) + row._count.productId,
      );
    }
    return frequency;
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
