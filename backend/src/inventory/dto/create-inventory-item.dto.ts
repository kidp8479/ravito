import { IsNotEmpty, IsNumber, IsString, Length, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  @Length(1, 20)
  unit!: string;
}
