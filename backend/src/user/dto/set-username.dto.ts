import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { validateUsername } from '../username.validator';

/** Custom class-validator decorator that delegates to the shared username validator. */
function IsValidUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidUsername',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return validateUsername(value).valid;
        },
        defaultMessage(args: ValidationArguments): string {
          if (typeof args.value === 'string') {
            return validateUsername(args.value).message ?? 'Invalid username.';
          }
          return 'username must be a string.';
        },
      },
    });
  };
}

export class SetUsernameDto {
  @ApiProperty({
    description:
      'Desired username. Must be 3–30 characters, contain only letters, digits, underscores, ' +
      'and dashes, start and end with a letter or digit, and have no consecutive special characters.',
    example: 'alice_dev',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @IsValidUsername()
  username!: string;
}
