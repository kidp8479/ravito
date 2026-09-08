import { ProductCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  defaultUnit?: string;
}
