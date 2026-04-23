import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidWalletAddress } from '../utils/wallet.utils';

/**
 * Validator constraint for Stellar wallet addresses
 * Uses the wallet.utils validation function
 */
@ValidatorConstraint({ name: 'IsStellarAddress', async: false })
export class IsStellarAddressConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return isValidWalletAddress(value);
  }

  defaultMessage(): string {
    return 'Invalid Stellar wallet address. Must be a valid Ed25519 public key (56 characters, starting with G)';
  }
}

/**
 * Decorator to validate Stellar wallet addresses
 * Automatically normalizes and validates the address using Stellar SDK
 *
 * @example
 * class UserDto {
 *   @IsStellarAddress()
 *   walletAddress: string;
 * }
 */
export function IsStellarAddress(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStellarAddressConstraint,
    });
  };
}
