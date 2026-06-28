import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IsStellarAddress } from '../../common/validators';

export class NonceRequestDto {
  @ApiProperty({
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    description: 'Stellar ED25519 public key (56 chars, starts with G)',
  })
  @IsStellarAddress()
  walletAddress: string;

  @ApiProperty({
    example: 'testnet',
    enum: ['mainnet', 'testnet'],
    description: 'Stellar network identifier',
  })
  @IsIn(['mainnet', 'testnet'], { message: 'network must be one of: mainnet, testnet' })
  network: string;
}

export class NonceResponseDto {
  @ApiProperty({ example: 'a3f8c2...', description: '64-char hex nonce to sign' })
  nonce: string;

  @ApiProperty({
    example: '2024-01-01T00:05:00.000Z',
    description: 'ISO-8601 timestamp after which the nonce is no longer valid',
  })
  expiresAt: string;
}
