import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({
    description: 'Ethereum-compatible wallet address',
    example: '0x71C841832047387195060979DC80EbbE62DCE35B',
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress must be a valid 42-character Ethereum address',
  })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'Cryptographic signature from wallet signing the nonce challenge',
    example: '0x30755ed65396fedf864256608263da23bf0b2201dd2ddd7c6adc83556cfae2880fede49e519e4f63e69fed1105ce66c3eec372f122c86b3d76220444abb164701b',
  })
  @IsOptional()
  @IsString()
  signature?: string;

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
