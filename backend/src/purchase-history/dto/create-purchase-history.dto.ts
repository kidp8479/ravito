import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
} from 'class-validator';

export class CreatePurchaseHistoryDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  // Defaults to now() when omitted (PurchaseHistoryService) - most manual
  // entries are logged right after the purchase, not backdated.
  @IsOptional()
  @IsISO8601()
  purchasedOn?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  @Length(1, 20)
  unit!: string;

  // Bounded to what the schema's Decimal(10, 2) column can actually hold
  // (backend/prisma/schema.prisma) - without maxDecimalPlaces and @Max, a
  // value that overflows or has more precision than the column allows
  // either fails inside the insert as a raw Postgres error (a 500) or
  // gets silently rounded on write, instead of a clean 400 caught before
  // the write.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99_999_999.99)
  unitPrice?: number;
}
