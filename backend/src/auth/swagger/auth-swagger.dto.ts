import { ApiProperty } from '@nestjs/swagger';

const WALLET = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

export class NonceRequestDto {
  @ApiProperty({ example: WALLET, description: 'Stellar public key (G...)' })
  walletAddress!: string;
}

export class NonceResponseDto {
  @ApiProperty({ example: 'a3f1c2d4e5b6a7980123456789abcdef' })
  nonce!: string;

  @ApiProperty({ example: '2025-01-01T00:05:00.000Z', description: 'Nonce expiry (single use)' })
  expiresAt!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: WALLET })
  walletAddress!: string;

  @ApiProperty({ example: 'a3f1c2d4e5b6a7980123456789abcdef' })
  nonce!: string;

  @ApiProperty({ description: 'Base64 Ed25519 signature of the nonce message' })
  signature!: string;
}

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'Rotating refresh token' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn!: number;
}

export class RefreshRequestDto {
  @ApiProperty()
  refreshToken!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Invalid signature' })
  message!: string;

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;
}
