import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @IsNotEmpty()
  otp: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  newPassword: string;
}