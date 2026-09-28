import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Role names are lowercase, start with a letter and stay URL friendly. */
export const ROLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,49}$/;

export class CreateRoleDto {
  @ApiProperty({
    description: 'Unique role name (lowercase)',
    example: 'moderator',
  })
  @IsString()
  @Matches(ROLE_NAME_PATTERN, {
    message:
      'name must be 2-50 characters, start with a letter and contain only letters, numbers, "-" or "_"',
  })
  name: string;

  @ApiPropertyOptional({ description: 'Human readable purpose of the role' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Permission strings granted by this role (e.g. "session:update")',
    type: [String],
    example: ['profile:read', 'message:send'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: 'Human readable purpose of the role' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'Replacement permission list', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class AssignRoleDto {
  @ApiProperty({ description: 'Role to grant', example: 'mentor' })
  @IsString()
  @IsNotEmpty()
  @Matches(ROLE_NAME_PATTERN, { message: 'roleName must be a valid role name' })
  roleName: string;
}

export class SetRolesDto {
  @ApiProperty({
    description: 'Complete replacement set of roles for the user',
    type: [String],
    example: ['mentee'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];
}
