import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', description: 'Stellar ED25519 public key' })
  @IsString()
  @IsNotEmpty()
  wallet: string;

  @ApiProperty({ example: 'a3f8c2...', description: 'The nonce received from GET /auth/nonce/:walletAddress' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({ example: 'base64signature==', description: 'ED25519 signature of "<network>:<nonce>" in base64' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ example: 'testnet', enum: ['mainnet', 'testnet'], description: 'Stellar network identifier' })
  @IsString()
  network: string;
}
