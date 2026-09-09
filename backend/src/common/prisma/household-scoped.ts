import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Thin per-model wrappers around PrismaService that make `householdId` a
// required, positional argument instead of an easy-to-forget `where`
// field - the tenant-isolation guarantee (CLAUDE.md: "No cross-household
// query in application code") lives here once instead of being re-derived
// at every call site. Not implemented as a generic Prisma Client Extension
// ($extends): that would need to type `args`/`query` against Prisma's
// per-operation generics, which only resolves to concrete input types with
// unsafe casts under this project's typed-lint config - a plain wrapper
// keeps every argument and return type exactly what Prisma generated.
//
// findUnique/update/delete below pass `{ id, householdId }` as the
// `where`: Prisma's generated `WhereUniqueInput` allows any other filter
// field alongside the unique one ("extended where on unique queries"), so
// this doesn't just filter the result after the fact - a row from another
// household genuinely doesn't match and comes back as not-found (P2025),
// the same as a nonexistent id. Verified against real Postgres in
// test/household-scoped.integration-spec.ts.
//
// update()'s `data` deliberately excludes `id` and `householdId`: Prisma's
// *Unchecked*UpdateInput types (needed here to set FK scalars like
// productId directly) list both as ordinary settable fields, so leaving
// them in would let a caller silently move a row to another household by
// passing `{ householdId: otherHouseholdId }` in `data` - the `where`
// clause still finds the caller's own row, but the write itself would
// re-point it.
//
// findMany is generic over its args (`T`) so a caller passing `include`
// or `select` (e.g. inventory items joined with their product) gets that
// shape back, not the bare model type - the cast at each return is
// exactly what Prisma's own non-$extends wrapping examples use to recover
// this: the merged where-scoped object can't be proven to still match `T`
// structurally, but the value itself is, since only `where` changed.

export function householdScopedProducts(
  prisma: PrismaService,
  householdId: string,
) {
  return {
    findMany<T extends Omit<Prisma.ProductFindManyArgs, 'where'>>(
      args: T & { where?: Prisma.ProductWhereInput } = {} as T,
    ): Prisma.PrismaPromise<Prisma.ProductGetPayload<T>[]> {
      return prisma.product.findMany({
        ...args,
        where: { ...args.where, householdId },
      }) as Prisma.PrismaPromise<Prisma.ProductGetPayload<T>[]>;
    },
    findUnique(id: string) {
      return prisma.product.findUnique({ where: { id, householdId } });
    },
    create(data: Omit<Prisma.ProductUncheckedCreateInput, 'householdId'>) {
      return prisma.product.create({ data: { ...data, householdId } });
    },
    update(
      id: string,
      data: Omit<Prisma.ProductUncheckedUpdateInput, 'id' | 'householdId'>,
    ) {
      return prisma.product.update({ where: { id, householdId }, data });
    },
    delete(id: string) {
      return prisma.product.delete({ where: { id, householdId } });
    },
  };
}

// A foreign key into Product only guarantees the referenced product
// exists *somewhere* - not that it belongs to this household. Without
// this check, InventoryItem/ShoppingListItem creation would let
// household A point a row at household B's product: an invisible
// cross-tenant reference this module exists specifically to prevent.
// Reuses householdScopedProducts' own findUnique rather than
// re-deriving the same scoped lookup per caller.
async function assertProductInHousehold(
  prisma: PrismaService,
  householdId: string,
  productId: string,
): Promise<void> {
  const product = await householdScopedProducts(prisma, householdId).findUnique(
    productId,
  );
  if (!product) {
    throw new NotFoundException('Product not found');
  }
}

export function householdScopedInventoryItems(
  prisma: PrismaService,
  householdId: string,
) {
  return {
    findMany<T extends Omit<Prisma.InventoryItemFindManyArgs, 'where'>>(
      args: T & { where?: Prisma.InventoryItemWhereInput } = {} as T,
    ): Prisma.PrismaPromise<Prisma.InventoryItemGetPayload<T>[]> {
      return prisma.inventoryItem.findMany({
        ...args,
        where: { ...args.where, householdId },
      }) as Prisma.PrismaPromise<Prisma.InventoryItemGetPayload<T>[]>;
    },
    findUnique<T extends Omit<Prisma.InventoryItemFindUniqueArgs, 'where'>>(
      id: string,
      args: T = {} as T,
    ): Prisma.PrismaPromise<Prisma.InventoryItemGetPayload<T> | null> {
      return prisma.inventoryItem.findUnique({
        ...args,
        where: { id, householdId },
      }) as Prisma.PrismaPromise<Prisma.InventoryItemGetPayload<T> | null>;
    },
    async create(
      data: Omit<Prisma.InventoryItemUncheckedCreateInput, 'householdId'>,
    ) {
      await assertProductInHousehold(prisma, householdId, data.productId);
      return prisma.inventoryItem.create({ data: { ...data, householdId } });
    },
    // productId is excluded here, not just householdId/id: an inventory
    // row's identity (which product, in which household) isn't meant to
    // change after creation - only quantity/unit are. That sidesteps
    // needing the same cross-household productId check on every update.
    update(
      id: string,
      data: Omit<
        Prisma.InventoryItemUncheckedUpdateInput,
        'id' | 'householdId' | 'productId'
      >,
    ) {
      return prisma.inventoryItem.update({
        where: { id, householdId },
        data,
      });
    },
    delete(id: string) {
      return prisma.inventoryItem.delete({ where: { id, householdId } });
    },
  };
}

export function householdScopedShoppingListItems(
  prisma: PrismaService,
  householdId: string,
) {
  return {
    findMany<T extends Omit<Prisma.ShoppingListItemFindManyArgs, 'where'>>(
      args: T & { where?: Prisma.ShoppingListItemWhereInput } = {} as T,
    ): Prisma.PrismaPromise<Prisma.ShoppingListItemGetPayload<T>[]> {
      return prisma.shoppingListItem.findMany({
        ...args,
        where: { ...args.where, householdId },
      }) as Prisma.PrismaPromise<Prisma.ShoppingListItemGetPayload<T>[]>;
    },
    count(
      args: Omit<Prisma.ShoppingListItemCountArgs, 'where'> & {
        where?: Prisma.ShoppingListItemWhereInput;
      } = {},
    ) {
      return prisma.shoppingListItem.count({
        ...args,
        where: { ...args.where, householdId },
      });
    },
    findUnique(id: string) {
      return prisma.shoppingListItem.findUnique({ where: { id, householdId } });
    },
    async create(
      data: Omit<
        Prisma.ShoppingListItemUncheckedCreateInput,
        'householdId' | 'checked' | 'checkedById'
      >,
    ) {
      if (data.productId) {
        await assertProductInHousehold(prisma, householdId, data.productId);
      }
      return prisma.shoppingListItem.create({
        data: { ...data, householdId },
      });
    },
    // checked/checkedById are excluded here, same reasoning as
    // InventoryItem's update excluding productId: checking an item is a
    // distinct action (setChecked below), not a field a general edit
    // should be able to flip as a side effect.
    update(
      id: string,
      data: Omit<
        Prisma.ShoppingListItemUncheckedUpdateInput,
        | 'id'
        | 'householdId'
        | 'productId'
        | 'checked'
        | 'checkedById'
        | 'addedById'
        | 'createdAt'
      >,
    ) {
      return prisma.shoppingListItem.update({
        where: { id, householdId },
        data,
      });
    },
    setChecked(id: string, checked: boolean, checkedById: string | null) {
      return prisma.shoppingListItem.update({
        where: { id, householdId },
        data: { checked, checkedById },
      });
    },
    delete(id: string) {
      return prisma.shoppingListItem.delete({ where: { id, householdId } });
    },
  };
}
