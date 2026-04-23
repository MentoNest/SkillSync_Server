import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsStellarAddress } from '../../../common/validators/stellar-address.validator';

export class LoginDto {
  @ApiProperty({
    description: 'Stellar wallet address (Ed25519 public key)',
    example: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
  })
  @IsStellarAddress()
  walletAddress: string;

  @ApiProperty({
    description: 'Signature of the nonce message',
    example: 'signature_hex_string',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'Nonce that was signed',
    example: 'random-uuid-nonce',
  })
  @IsString()
  nonce: string;
}
