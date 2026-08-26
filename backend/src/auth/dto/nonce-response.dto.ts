import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description: 'Wallet address associated with the requested challenge',
    example: '0x71C841832047387195060979DC80EbbE62DCE35B',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Cryptographic random nonce challenge to be signed by user wallet',
    example: 'Sign this one-time challenge to authenticate with SkillSync: 98a76b54c321',
  })
  nonce: string;

  @ApiProperty({
    description: 'Timestamp when this challenge was issued',
    example: '2026-08-25T12:00:00.000Z',
  })
  issuedAt: Date;

  @ApiProperty({
    description: 'Expiration duration of the nonce in seconds',
    example: 300,
  })
  expiresInSeconds: number;
}
