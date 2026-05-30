import { IsString } from 'class-validator';
import { isValidStellarAddress } from '../validators/stellar-wallet.validator';
import { Validate } from 'class-validator';

class StellarAddressValidator {
  validate(value: any): boolean {
    return typeof value === 'string' && isValidStellarAddress(value);
  }
}

export class LoginDto {
  @Validate(StellarAddressValidator)
  walletAddress: string;

  @IsString()
  signature: string;

  @IsString()
  message: string;
}
