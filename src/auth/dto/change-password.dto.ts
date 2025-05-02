import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password of the user',
    example: 'CurrentPassword123!',
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'New password for the user',
    example: 'NewPassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number or special character',
  })
  newPassword: string;

  @ApiProperty({
    description: 'Confirmation of the new password',
    example: 'NewPassword123!',
  })
  @IsString()
  confirmNewPassword: string;
}
