import { IsEmail, IsEnum, IsString, MinLength, Matches } from 'class-validator';
import { Role } from 'src/common/enum/role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ 
    description: 'The email address of the user',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ 
    description: 'The password of the user',
    example: 'Password123!',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number or special character'
  })
  password: string;

  @ApiProperty({ 
    description: 'The role of the user',
    enum: Role,
    example: Role.MENTOR
  })
  @IsEnum(Role, { message: 'Role must be either MENTOR or MENTEE' })
  role: Role;
}