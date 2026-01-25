import { IsEmail, IsArray, IsEnum, IsOptional, MinLength } from 'class-validator';
import { UserRole, UserStatus } from '@libs/common';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  password!: string;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @Type(() => String)
  roles?: UserRole[];

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  firstName?: string;

  @IsOptional()
  lastName?: string;
}
