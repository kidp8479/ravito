import { IsString, Length } from 'class-validator';

export class JoinHouseholdDto {
  @IsString()
  @Length(1, 64)
  code!: string;
}
