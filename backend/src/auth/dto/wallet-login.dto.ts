import { IsString, IsNotEmpty } from 'class-validator';
import { IsValidWalletAddress } from '../../common/validators/is-valid-wallet-address.validator.js';

/**
 * #973: DTO for wallet-based login via signature verification.
 */
export class WalletLoginDto {
  @IsString()
  @IsNotEmpty()
  @IsValidWalletAddress()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}
