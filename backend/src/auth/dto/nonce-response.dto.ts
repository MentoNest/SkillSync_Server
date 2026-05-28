import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description: 'One-time nonce to be signed by the wallet',
    example: 'a3f8c2d1-7b4e-4f9a-8c3d-2e1f0b5a6c7d',
  })
  nonce: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when the nonce expires',
    example: '2026-05-28T13:00:00.000Z',
  })
  expiresAt: string;
}