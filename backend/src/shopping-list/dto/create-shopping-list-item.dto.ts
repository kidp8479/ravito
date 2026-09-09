import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class CreateShoppingListItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @IsString()
  @Length(1, 100)
  rawLabel!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  @Length(1, 20)
  unit!: string;
}
