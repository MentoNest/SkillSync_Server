import { IsString, IsNotEmpty, Length, IsEthereumAddress, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
