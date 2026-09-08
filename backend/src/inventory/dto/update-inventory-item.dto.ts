import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;
}
