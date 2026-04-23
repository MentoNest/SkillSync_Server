import { ApiProperty } from '@nestjs/swagger';
import { IsEthereumAddress } from 'class-validator';

export class NonceDto {
  @ApiProperty({
    description: 'Ethereum wallet address',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsEthereumAddress()
  walletAddress: string;
}
