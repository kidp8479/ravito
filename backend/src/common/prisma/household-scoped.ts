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

export function householdScopedProducts(
  prisma: PrismaService,
  householdId: string,
) {
  return {
    findMany(
      args: Omit<Prisma.ProductFindManyArgs, 'where'> & {
        where?: Prisma.ProductWhereInput;
      } = {},
    ) {
      return prisma.product.findMany({
        ...args,
        where: { ...args.where, householdId },
      });
    },
    findUnique(id: string) {
      return prisma.product.findUnique({ where: { id, householdId } });
    },
    create(data: Omit<Prisma.ProductUncheckedCreateInput, 'householdId'>) {
      return prisma.product.create({ data: { ...data, householdId } });
    },
    update(id: string, data: Prisma.ProductUncheckedUpdateInput) {
      return prisma.product.update({ where: { id, householdId }, data });
    },
    delete(id: string) {
      return prisma.product.delete({ where: { id, householdId } });
    },
  };
}

export function householdScopedInventoryItems(
  prisma: PrismaService,
  householdId: string,
) {
  return {
    findMany(
      args: Omit<Prisma.InventoryItemFindManyArgs, 'where'> & {
        where?: Prisma.InventoryItemWhereInput;
      } = {},
    ) {
      return prisma.inventoryItem.findMany({
        ...args,
        where: { ...args.where, householdId },
      });
    },
    findUnique(id: string) {
      return prisma.inventoryItem.findUnique({ where: { id, householdId } });
    },
    create(
      data: Omit<Prisma.InventoryItemUncheckedCreateInput, 'householdId'>,
    ) {
      return prisma.inventoryItem.create({ data: { ...data, householdId } });
    },
    update(id: string, data: Prisma.InventoryItemUncheckedUpdateInput) {
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
