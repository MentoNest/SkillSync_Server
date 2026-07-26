import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * #973: DTO for wallet-based login via signature verification.
 */
export class WalletLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, { message: 'Invalid Stellar public key format' })
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}
