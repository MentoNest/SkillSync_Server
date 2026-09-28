import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// #1177: alphanumeric with underscores/dashes, 3-30 chars, no leading/
// trailing/consecutive special characters.
export const USERNAME_PATTERN = /^(?!.*[_-]{2})[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]$/;

export class UpdateUsernameDto {
  @ApiProperty({
    description: 'New unique username (alphanumeric, underscores and dashes, 3-30 characters)',
    example: 'alex_rivers-99',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @Length(3, 30)
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3-30 characters, alphanumeric with underscores/dashes only, and cannot start/end with or repeat a special character',
  })
  username: string;
}
