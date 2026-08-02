import { IsString, Length, Matches } from 'class-validator';
import { USERNAME_PATTERN } from './update-username.dto.js';

export class UsernameAvailabilityQueryDto {
  @IsString()
  @Length(3, 30)
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be alphanumeric with optional single underscores/dashes between characters',
  })
  username: string;
}
