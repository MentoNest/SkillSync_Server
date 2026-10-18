import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { USERNAME_REGEX } from '../username.service';

export class ChangeUsernameDto {
  @ApiProperty({ example: 'jane_mentor', minLength: 3, maxLength: 30 })
  @IsString()
  @Matches(USERNAME_REGEX, {
    message: 'username must be 3-30 chars: letters, digits, "_" or "-" with no consecutive special chars',
  })
  username!: string;
}
