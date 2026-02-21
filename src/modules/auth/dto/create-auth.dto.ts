import { IsString, IsNotEmpty, Length, IsEthereumAddress, IsOptional } from 'class-validator';
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

    description:
      'User password - must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 32,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(32, { message: 'Password must not exceed 32 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',

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