import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // Length only, no complexity rules: complexity requirements push users
  // towards predictable patterns more than they stop guessing. Argon2id
  // plus rate limiting (RAV-6) is the real defense.
  @IsString()
  @Length(8, 72)
  password!: string;

  @IsString()
  @Length(1, 100)
  displayName!: string;
}
