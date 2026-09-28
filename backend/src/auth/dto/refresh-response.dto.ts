import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshResponseDto {
  @ApiProperty({
    description: 'New JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Rotated refresh token. The presented one is revoked immediately, so this value replaces it.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIn0.signature',
  })
  refreshToken: string;

  @ApiProperty({ description: 'Type of access token', example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({
    description: 'Access token lifetime in seconds (JWT_ACCESS_EXPIRATION, default 15m)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh token lifetime in seconds (JWT_REFRESH_EXPIRATION_DAYS, default 30d)',
    example: 2592000,
  })
  refreshExpiresIn: number;

  @ApiPropertyOptional({
    description: 'How often this session family has been rotated, starting at 1',
    example: 3,
  })
  rotationCount?: number;

  @ApiPropertyOptional({
    description:
      'True when the refresh came from a different device or IP prefix than the one that created the session',
    example: false,
  })
  deviceChanged?: boolean;
}
