import { ApiProperty } from '@nestjs/swagger';

export class IssuedNonceResponseDto {
  @ApiProperty({
    description: 'Single-use cryptographically secure nonce (64-character hex string).',
    example: 'a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056',
  })
  nonce!: string;

  @ApiProperty({
    description: 'Time at which the nonce expires.',
    example: '2026-11-21T19:34:15.044Z',
    format: 'date-time',
  })
  expiresAt!: string;
}
