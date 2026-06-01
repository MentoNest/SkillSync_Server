import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator for Stellar wallet addresses
 * Stellar public keys start with 'G' and are 56 characters long (base32)
 */
@ValidatorConstraint({ name: 'isStellarAddress', async: false })
export class IsStellarAddressConstraint implements ValidatorConstraintInterface {
  validate(address: string): boolean {
    if (typeof address !== 'string') return false;
    // Stellar public keys start with G and are 56 characters (base32)
    return /^G[A-Z2-7]{55}$/.test(address);
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid Stellar wallet address. Must start with G and be 56 characters.';
  }
}

/**
 * Decorator to validate Stellar wallet addresses
 */
export function IsStellarAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStellarAddressConstraint,
    });
  };
}

/**
 * Custom validator for Stellar signatures
 * Stellar signatures are base64-encoded, typically 64 bytes for Ed25519 signatures
 */
@ValidatorConstraint({ name: 'isStellarSignature', async: false })
export class IsStellarSignatureConstraint implements ValidatorConstraintInterface {
  validate(signature: string): boolean {
    if (typeof signature !== 'string') return false;
    // Base64 encoding of 64 bytes is approximately 88 characters
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    return base64Regex.test(signature) && signature.length >= 80 && signature.length <= 200;
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid Stellar signature. Must be a valid base64-encoded signature.';
  }
}

/**
 * Decorator to validate Stellar signatures
 */
export function IsStellarSignature(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStellarSignatureConstraint,
    });
  };
}

/**
 * Custom validator for IANA timezone strings
 */
@ValidatorConstraint({ name: 'isValidTimezone', async: false })
export class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(timezone: string): boolean {
    if (typeof timezone !== 'string') return false;
    try {
      // Check if the timezone is valid by trying to use it
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid timezone. Must be a valid IANA timezone (e.g., "America/New_York").';
  }
}

/**
 * Decorator to validate IANA timezone strings
 */
export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTimezoneConstraint,
    });
  };
}

/**
 * Custom validator to check if a date is after another date property
 */
@ValidatorConstraint({ name: 'isAfterDate', async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(date: string, args: ValidationArguments): boolean {
    if (typeof date !== 'string') return false;
    
    const comparisonDateProperty = args.constraints[0];
    if (!comparisonDateProperty) return true; // No comparison date, skip validation
    
    const comparisonDate = (args.object as any)[comparisonDateProperty];
    if (!comparisonDate) return true; // Comparison date not provided, skip validation
    
    // Check if both are time strings (HH:MM format)
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (timeRegex.test(date) && timeRegex.test(comparisonDate)) {
      // Compare time strings directly
      return date > comparisonDate;
    }
    
    // Otherwise, treat as dates
    const dateObj = new Date(date);
    const comparisonDateObj = new Date(comparisonDate);
    
    return !isNaN(dateObj.getTime()) && !isNaN(comparisonDateObj.getTime()) && dateObj > comparisonDateObj;
  }

  defaultMessage(args: ValidationArguments): string {
    const comparisonDateProperty = args.constraints[0];
    return `Date must be after ${comparisonDateProperty}.`;
  }
}

/**
 * Decorator to validate if a date is after another date property
 * @param comparisonDateProperty The property name to compare against
 */
export function IsAfterDate(comparisonDateProperty: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [comparisonDateProperty],
      validator: IsAfterDateConstraint,
    });
  };
}

/**
 * Custom validator for time format (HH:MM)
 */
@ValidatorConstraint({ name: 'isTimeFormat', async: false })
export class IsTimeFormatConstraint implements ValidatorConstraintInterface {
  validate(time: string): boolean {
    if (typeof time !== 'string') return false;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid time format. Must be in HH:MM format (24-hour).';
  }
}

/**
 * Decorator to validate time format (HH:MM)
 */
export function IsTimeFormat(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsTimeFormatConstraint,
    });
  };
}

/**
 * Custom validator for date format (YYYY-MM-DD)
 */
@ValidatorConstraint({ name: 'isDateFormat', async: false })
export class IsDateFormatConstraint implements ValidatorConstraintInterface {
  validate(date: string): boolean {
    if (typeof date !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    
    // Validate that it's a real date
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime()) && dateObj.toISOString().startsWith(date);
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid date format. Must be in YYYY-MM-DD format and a valid date.';
  }
}

/**
 * Decorator to validate date format (YYYY-MM-DD)
 */
export function IsDateFormat(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDateFormatConstraint,
    });
  };
}

/**
 * Custom validator for ISO date strings
 */
@ValidatorConstraint({ name: 'isISODate', async: false })
export class IsISODateConstraint implements ValidatorConstraintInterface {
  validate(date: string): boolean {
    if (typeof date !== 'string') return false;
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Invalid ISO date string.';
  }
}

/**
 * Decorator to validate ISO date strings
 */
export function IsISODate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsISODateConstraint,
    });
  };
}
