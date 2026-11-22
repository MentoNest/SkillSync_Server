import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidStellarWalletAddress } from './wallet-address';

/** Business-rule validator for Stellar wallet addresses (#1692). */
export function IsValidWalletAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidWalletAddress',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: {
        message: '$property must be a valid Stellar ED25519 public key',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return isValidStellarWalletAddress(value);
        },
      },
    });
  };
}
