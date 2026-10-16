import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

const WALLET = /^G[A-Z2-7]{55}$/i;

export class NonceRequestDto {
  @IsString()
  @Matches(WALLET, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;
}

export class LoginDto {
  @IsString()
  @Matches(WALLET, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;

  @IsString()
  @Length(32, 128)
  nonce!: string;

  /** Base64 Ed25519 signature over the login message. */
  @IsString()
  @IsNotEmpty()
  signature!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
