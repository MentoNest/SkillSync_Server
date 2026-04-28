import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * Stellar public key (G…) or contract address (C…):
 * - Starts with G or C
 * - 56 base32 characters (A-Z, 2-7)
 */
const STELLAR_ADDRESS_REGEX = /^[GC][A-Z2-7]{55}$/;

@ValidatorConstraint({ name: 'IsStellarAddress', async: false })
export class IsStellarAddressConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    return typeof value === 'string' && STELLAR_ADDRESS_REGEX.test(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return '$property must be a valid Stellar public key or contract address';
  }
}

/**
 * Validates that a string is a valid Stellar public key (G…) or contract address (C…).
 *
 * @example
 * class Dto {
 *   @IsStellarAddress()
 *   walletAddress: string;
 * }
 */
export function IsStellarAddress(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsStellarAddress',
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsStellarAddressConstraint,
    });
  };
}
