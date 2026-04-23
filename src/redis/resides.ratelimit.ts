import { ApiProperty } from '@nestjs/swagger';
import { IsEthereumAddress, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Ethereum wallet address',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsEthereumAddress()
  walletAddress: string;

  @ApiProperty({
    description: 'Signature of the nonce message',
    example: '0xabc123...',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'Nonce that was signed',
    example: 'random-nonce-string',
  })
  @IsString()
  nonce: string;
}



export class NonceDto {
  @ApiProperty({
    description: 'Ethereum wallet address',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsEthereumAddress()
  walletAddress: string;
}
