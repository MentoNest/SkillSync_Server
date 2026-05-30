import { IsString, IsNotEmpty, Validate } from 'class-validator';
import { isValidUsername } from '../validators/username.validator';

class UsernameValidator {
  validate(value: any): boolean {
    return typeof value === 'string' && isValidUsername(value);
  }
}

export class CheckUsernameDto {
  @Validate(UsernameValidator)
  @IsNotEmpty()
  @IsString()
  username: string;
}
