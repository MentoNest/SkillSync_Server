import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** Stellar account public key (G..., 56 chars of base32). */
export const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

export class NonceDto {
  @ApiProperty({
    description: 'Stellar wallet public key (ED25519) that will sign the login message.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    pattern: '^G[A-Z2-7]{55}$',
  })
  @IsString()
  @Matches(STELLAR_ADDRESS, { message: 'address must be a valid Stellar public key' })
  address!: string;
}
