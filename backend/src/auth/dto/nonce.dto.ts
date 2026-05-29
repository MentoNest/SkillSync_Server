import { IsEthereumAddress } from 'class-validator';

export class NonceDto {
  @IsEthereumAddress()
  walletAddress: string;
}