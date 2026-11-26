import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description:
      'Single-use random nonce (64 hex characters). Embedded in the login message.',
    example: 'a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056',
  })
  nonce!: string;

  @ApiProperty({
    description:
      'The exact UTF-8 string the wallet must sign with its ED25519 private key. ' +
      'Do not modify the message before signing.',
    example:
      'SkillSync login\nAddress: GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37\nNonce: a3f8c2e1b74d9056a3f8c2e1b74d9056',
  })
  message!: string;

  @ApiProperty({
    description:
      'Seconds until this nonce expires. The default window is 300 seconds (5 minutes).',
    example: 300,
  })
  expiresIn!: number;
}
