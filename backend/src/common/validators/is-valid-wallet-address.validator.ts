import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { isValidWalletAddress, normalizeWalletAddress } from '../utils/wallet-address';

/**
 * Validates that a property is a Stellar `G...` Ed25519 public key (#1460).
 *
 * Accepts any casing and surrounding whitespace, matching how the rest of the
 * codebase stores addresses, but rejects anything else with a message that
 * names the expected shape.
 */
export function IsValidWalletAddress(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidWalletAddress',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' && isValidWalletAddress(value),
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be a valid Stellar wallet address starting with "G" (received "${normalizeSafe(args.value)}")`,
      },
    });
  };
}

function normalizeSafe(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 12) : String(value);
}