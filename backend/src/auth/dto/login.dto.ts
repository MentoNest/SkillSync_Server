import { IsString, IsNotEmpty } from 'class-validator';
import { isValidStellarAddress } from '../validators/stellar-wallet.validator';
import { Validate } from 'class-validator';

class StellarAddressValidator {
  validate(value: any): boolean {
    return typeof value === 'string' && isValidStellarAddress(value);
  }
}

class StellarSignatureValidator {
  validate(value: any): boolean {
    if (typeof value !== 'string') return false;
    // Stellar signatures are base64-encoded, typically 64 bytes for Ed25519 signatures
    // Base64 encoding of 64 bytes is approximately 88 characters
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    return base64Regex.test(value) && value.length >= 80 && value.length <= 200;
  }
}

export class LoginDto {
  @Validate(StellarAddressValidator)
  @IsNotEmpty()
  walletAddress: string;

  @Validate(StellarSignatureValidator)
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}
