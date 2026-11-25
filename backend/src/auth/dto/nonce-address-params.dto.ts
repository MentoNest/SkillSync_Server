import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { IsValidWalletAddress } from '../../common/validators';

export class NonceAddressParamsDto {
  @ApiProperty({
    description: 'Stellar wallet public key (ED25519).',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    pattern: '^G[A-Z2-7]{55}$',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsValidWalletAddress({
    message: 'walletAddress must be a valid Stellar public key',
  })
  walletAddress!: string;
}
