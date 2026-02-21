import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description: 'Cryptographically random nonce for authentication',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef',
  })
  nonce: string;

  @ApiProperty({
    description: 'Expiration timestamp in seconds',
    example: 1640995200,
  })
  expiresAt: number;

  @ApiProperty({
    description: 'Time to live in seconds',
    example: 300,
  })
  ttl: number;
}
