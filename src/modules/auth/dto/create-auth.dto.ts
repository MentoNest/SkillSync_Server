import {
  IsString,
  IsNotEmpty,
  Length,
  IsEthereumAddress,
  IsOptional,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Custom validator to check if password and confirmPassword match
 */
@ValidatorConstraint({ name: 'matchPassword', async: false })
class MatchPasswordConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments): boolean {
    const object = args.object as { password?: string };
    return object.password === confirmPassword;
  }

  defaultMessage(): string {
    return 'Passwords do not match';
  }
}

/**
 * DTO for user registration
 */
export class RegisterDto {
  @ApiProperty({
    description: 'First name of the user',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password',
    example: 'SecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * DTO for user login
 */
export class LoginDto {
  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password',
    example: 'SecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateAuthDto {
  @ApiProperty({
    description: 'Wallet address for authentication',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @IsEthereumAddress({
    message: 'Invalid wallet address format',
  })
  @IsNotEmpty({
    message: 'Wallet address is required',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Cryptographic signature',
    example: '0x1234567890abcdef...',
  })
  @IsString({
    message: 'Signature must be a string',
  })
  @IsNotEmpty({
    message: 'Signature is required',
  })
  @Length(132, 132, {
    message: 'Signature must be exactly 132 characters long (65 bytes hex)',
  })
  signature: string;

  @ApiPropertyOptional({
    description: 'Nonce used for signing',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef',
  })
  @IsString({
    message: 'Nonce must be a string',
  })
  @IsOptional()
  nonce?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { device: 'mobile', appVersion: '1.0.0' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
