import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Role } from 'src/common/enum/role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ 
    description: 'The email address of the user',
    example: 'user@example.com',
    required: false
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({ 
    description: 'The role of the user',
    enum: Role,
    example: Role.MENTOR,
    required: false
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Role must be either MENTOR or MENTEE' })
  role?: Role;
}