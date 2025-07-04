import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { userRole } from 'src/common/enums/role.enum';

export class UpdateUserDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({
    description: 'The role of the user',
    enum: userRole,
    example: userRole.MENTOR,
    required: false,
  })
  @IsOptional()
  @IsEnum(userRole, { message: 'Role must be either ADMIN, MENTOR or MENTEE' })
  role?: userRole;

  @ApiProperty({
    description: 'The full name of the user',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters long' })
  fullName?: string;

  @ApiProperty({
    description: 'The bio of the user',
    example: 'Experienced software developer...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Bio must be at least 10 characters long' })
  bio?: string;

  @ApiProperty({
    description: 'The skills of the user',
    example: ['JavaScript', 'React', 'Node.js'],
    required: false,
    isArray: true,
  })
  @IsOptional()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({
    description: 'The programming languages of the user',
    example: ['TypeScript', 'Python', 'Java'],
    required: false,
    isArray: true,
  })
  @IsOptional()
  @IsString({ each: true })
  programmingLanguages?: string[];
}
