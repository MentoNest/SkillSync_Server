import { IsString, IsNotEmpty, Length, Validate } from 'class-validator';
import { isValidUsername } from '../validators/username.validator';

class UsernameValidator {
  validate(value: any): boolean {
    return typeof value === 'string' && isValidUsername(value);
  }
}

export class UpdateUsernameDto {
  @Validate(UsernameValidator)
  @IsNotEmpty()
  @IsString()
  username: string;
}
