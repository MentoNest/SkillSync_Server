import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { tryNormalizeWalletAddress } from '../utils/wallet.utils.js';

/**
 * #1006: Business-rule validator for Stellar public key wallet addresses.
 * Reuses the same normalization/format rules as the auth layer so DTO-level
 * validation and service-level normalization never drift apart.
 */
@ValidatorConstraint({ name: 'IsValidWalletAddress', async: false })
export class IsValidWalletAddressConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return typeof value === 'string' && tryNormalizeWalletAddress(value) !== null;
  }

  defaultMessage(): string {
    return 'walletAddress must be a valid Stellar public key (G + 55 base32 characters)';
  }
}

export function IsValidWalletAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidWalletAddressConstraint,
    });
  };
}
