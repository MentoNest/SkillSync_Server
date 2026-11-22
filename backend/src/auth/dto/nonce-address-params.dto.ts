import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { STELLAR_ADDRESS } from './nonce.dto';

export class NonceAddressParamsDto {
  @ApiProperty({
    description: 'Stellar wallet public key (ED25519).',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    pattern: '^G[A-Z2-7]{55}$',
  })
  @IsString()
  @Matches(STELLAR_ADDRESS, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;
}
