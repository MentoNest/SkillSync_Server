import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

@ValidatorConstraint({ name: 'isValidWalletAddress', async: false })
export class IsValidWalletAddressConstraint implements ValidatorConstraintInterface {
  validate(walletAddress: string, args: ValidationArguments) {
    if (!walletAddress) return false;
    return STELLAR_ADDRESS_REGEX.test(walletAddress.toUpperCase());
  }

  defaultMessage(args: ValidationArguments) {
    return 'walletAddress ($value) must be a valid 56-character Stellar public key (G-address)';
  }
}

export function IsValidWalletAddress(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidWalletAddressConstraint,
    });
  };
}