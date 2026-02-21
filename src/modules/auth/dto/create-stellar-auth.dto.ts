// src/auth/dto/create-stellar-auth.dto.ts
// Mirrors the style of CreateAuthDto — same validator patterns, same Swagger decorators.

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStellarAuthDto {
  @ApiProperty({
    description: 'Stellar public key (G… address) of the authenticating wallet',
    example: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3ZAPR4DM3',
  })
  @IsString({ message: 'publicKey must be a string' })
  @IsNotEmpty({ message: 'publicKey is required' })
  publicKey: string;

  @ApiProperty({
    description: 'Base64-encoded Ed25519 signature of the server-issued nonce',
    example: 'ABC123...==',
  })
  @IsString({ message: 'signature must be a string' })
  @IsNotEmpty({ message: 'signature is required' })
  signature: string;

  @ApiProperty({
    description: 'Server-issued nonce that was signed',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef',
  })
  @IsString({ message: 'nonce must be a string' })
  @IsNotEmpty({ message: 'nonce is required' })
  nonce: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { device: 'mobile', appVersion: '1.0.0' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}