import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

const WALLET = /^G[A-Z2-7]{55}$/i;

export class LoginDto {
  @ApiProperty({ example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7' })
  @IsString()
  @Matches(WALLET, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;

  @ApiProperty({ minLength: 32, maxLength: 128 })
  @IsString()
  @Length(32, 128)
  nonce!: string;

  /** Base64 Ed25519 signature over the login message. */
  @ApiProperty({ description: 'Base64 Ed25519 signature over the login message' })
  @IsString()
  @IsNotEmpty()
  signature!: string;
}
