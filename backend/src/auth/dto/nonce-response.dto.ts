import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description: 'Stellar wallet address associated with the requested challenge',
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
  })
  walletAddress: string;

  @ApiProperty({
    description:
      'Cryptographically secure one-time nonce (256-bit, hex encoded) to be signed by the Stellar wallet',
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  })
  nonce: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when this nonce expires (5 minutes after issue)',
    example: '2026-08-27T12:05:00.000Z',
  })
  expiresAt: Date;
}
