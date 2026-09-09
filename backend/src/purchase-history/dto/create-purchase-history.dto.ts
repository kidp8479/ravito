import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
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

  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitPrice?: number;
}
