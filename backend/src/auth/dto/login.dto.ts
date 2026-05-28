import { IsEthereumAddress, IsString } from 'class-validator';

export class LoginDto {
  @IsEthereumAddress()
  walletAddress: string;

  @IsString()
  signature: string;

  @IsString()
  message: string;
}