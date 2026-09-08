import { IsString, Length } from 'class-validator';

export class SearchProductsDto {
  @IsString()
  @Length(1, 100)
  q!: string;
}
