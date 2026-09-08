import { IsString, Length } from 'class-validator';

export class CreateHouseholdDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
