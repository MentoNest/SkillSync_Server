import { ApiProperty } from '@nestjs/swagger';
import { IsEthereumAddress, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Stellar wallet public key (G... address)',
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsEthereumAddress()
  walletAddress: string;

  @ApiProperty({
    description: 'Cryptographic signature of the nonce using the wallet private key',
    example: '3045022100a1b2c3...d4e5f6',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'The signed message (nonce value returned by GET /auth/nonce/:walletAddress)',
    example: 'a3f8c2d1-7b4e-4f9a-8c3d-2e1f0b5a6c7d',
  })
  @IsString()
  message: string;
}