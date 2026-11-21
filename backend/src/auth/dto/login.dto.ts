import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsString, Matches, MaxLength } from 'class-validator';
import { STELLAR_ADDRESS } from './nonce.dto';

export class LoginDto {
  @ApiProperty({
    description: 'Stellar wallet public key that owns the pending nonce.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    pattern: '^G[A-Z2-7]{55}$',
  })
  @IsString()
  @Matches(STELLAR_ADDRESS, { message: 'address must be a valid Stellar public key' })
  address!: string;

  @ApiProperty({
    description:
      'Base64-encoded ED25519 signature of the exact login message returned by POST /auth/nonce. ' +
      'The nonce is consumed on first use and cannot be replayed.',
    example: 'ABC123+/base64signaturehere==',
    maxLength: 128,
  })
  @IsBase64()
  @MaxLength(128)
  signature!: string;
}
