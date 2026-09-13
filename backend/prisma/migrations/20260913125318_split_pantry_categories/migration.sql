-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductCategory" ADD VALUE 'PASTA_RICE_AND_GRAINS';
ALTER TYPE "ProductCategory" ADD VALUE 'CANNED_AND_JARRED';
ALTER TYPE "ProductCategory" ADD VALUE 'SAUCES_OILS_AND_CONDIMENTS';
ALTER TYPE "ProductCategory" ADD VALUE 'SPICES_AND_HERBS';
ALTER TYPE "ProductCategory" ADD VALUE 'BAKING';
ALTER TYPE "ProductCategory" ADD VALUE 'SNACKS_AND_DRIED_GOODS';
