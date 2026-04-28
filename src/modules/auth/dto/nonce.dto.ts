import { ApiProperty } from '@nestjs/swagger';
import { IsStellarAddress } from '../../../common/validators/stellar-address.validator';

export class NonceDto {
  @ApiProperty({
    description: 'Stellar wallet address (Ed25519 public key)',
    example: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
  })
  @IsStellarAddress()
  walletAddress: string;
}
