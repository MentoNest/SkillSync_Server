import { IsString, Length, Matches } from 'class-validator';

/**
 * #1003: alphanumeric + underscore/dash, 3-30 chars, no leading/trailing or
 * consecutive special characters.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9]+(?:[_-][a-zA-Z0-9]+)*$/;

export class UpdateUsernameDto {
  @IsString()
  @Length(3, 30)
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be alphanumeric with optional single underscores/dashes between characters',
  })
  username: string;
}
