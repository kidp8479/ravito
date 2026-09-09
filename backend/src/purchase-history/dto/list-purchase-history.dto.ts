import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListPurchaseHistoryDto {
  // Unlike Product/InventoryItem/ShoppingListItem, PurchaseHistory is an
  // append-only event log with no natural upper bound on row count (one
  // row per purchase, forever) - bounded here so the response can't grow
  // without limit over a household's lifetime.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
