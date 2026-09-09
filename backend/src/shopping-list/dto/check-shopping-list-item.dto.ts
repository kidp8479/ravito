import { IsBoolean } from 'class-validator';

export class CheckShoppingListItemDto {
  @IsBoolean()
  checked!: boolean;
}
