import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Stellar Ed25519 public key: 56-char base32 string starting with 'G'.
 */
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

export enum StellarNetwork {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
}

export class LoginDto {
  @ApiPropertyOptional({
    description: 'Stellar wallet address (Ed25519 public key, G-address)',
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
  })
  @IsOptional()
  @IsString()
  @Matches(STELLAR_ADDRESS_REGEX, {
    message: 'walletAddress must be a valid 56-character Stellar public key (G-address)',
  })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'The nonce previously issued by GET /auth/nonce/:walletAddress that was signed',
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nonce?: string;

  @ApiPropertyOptional({
    description: 'Stellar wallet signature over the nonce (hex or base64 encoded)',
    example: '2e7f6b...',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  signature?: string;

  @ApiPropertyOptional({
    description: 'Stellar network the wallet belongs to (mainnet or testnet)',
    enum: StellarNetwork,
    default: StellarNetwork.MAINNET,
  })
  @IsOptional()
  @IsEnum(StellarNetwork)
  network?: StellarNetwork;

  @ApiPropertyOptional({
    description: 'User email (for email/password authentication)',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'User password (for email/password authentication)',
    example: 'SecretPass123!',
  })
  @IsOptional()
  @IsString()
  password?: string;
}
