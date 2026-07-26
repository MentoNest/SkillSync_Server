import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * #985: Swagger documentation DTOs for auth API.
 */

export class NonceResponseDto {
  @ApiProperty({ description: 'Nonce string for the user to sign', example: 'Sign this message to authenticate with SkillSync: a1b2c3...' })
  nonce: string;

  @ApiProperty({ description: 'Nonce expiration timestamp (Unix ms)', example: 1700000000000 })
  expiresAt: number;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token', example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token for obtaining new access tokens', example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken: string;

  @ApiProperty({ description: 'Access token TTL in seconds', example: 900 })
  expiresIn: number;
}

export class RefreshResponseDto extends LoginResponseDto {}

export class LogoutResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}

export class RevokeAllResponseDto {
  @ApiProperty({ description: 'Number of sessions revoked', example: 3 })
  revokedCount: number;

  @ApiProperty({ description: 'Wallet address whose sessions were revoked', example: 'GABC...' })
  walletAddress: string;

  @ApiProperty({ description: 'Revocation timestamp', example: 1700000000000 })
  timestamp: number;
}

export class ErrorDto {
  @ApiProperty({ description: 'HTTP status code', example: 401 })
  statusCode: number;

  @ApiProperty({ description: 'Error code', example: 'invalid_token' })
  error: string;

  @ApiProperty({ description: 'Human-readable error message', example: 'Token has expired' })
  message: string;

  @ApiProperty({ description: 'Correlation ID for debugging', example: '1700000000000-abc123' })
  correlationId: string;

  @ApiProperty({ description: 'Error timestamp', example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Request path', example: '/auth/me' })
  path: string;
}
