import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}
