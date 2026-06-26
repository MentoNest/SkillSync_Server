import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'GABC...XYZ', description: 'Stellar wallet public key' })
  @IsString() @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({ example: 'abc123nonce', description: 'One-time nonce retrieved from /auth/nonce' })
  @IsString() @IsNotEmpty()
  nonce: string;

  @ApiProperty({ example: 'MEUC...base64signature', description: 'Ed25519 signature of the nonce' })
  @IsString() @IsNotEmpty()
  signature: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGci...', description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ example: 'dGhpcyBp...', description: 'Refresh token for session renewal' })
  refreshToken: string;

  @ApiProperty({ example: 3600, description: 'Access token expiry in seconds' })
  expiresIn: number;
}

export class RefreshRequestDto {
  @ApiProperty({ example: 'dGhpcyBp...', description: 'Valid refresh token' })
  @IsString() @IsNotEmpty()
  refreshToken: string;
}

export class NonceResponseDto {
  @ApiProperty({ example: 'abc123nonce', description: 'One-time challenge nonce to sign' })
  nonce: string;

  @ApiProperty({ example: 300, description: 'Nonce validity window in seconds' })
  expiresIn: number;
}
