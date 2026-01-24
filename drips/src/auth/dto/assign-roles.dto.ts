import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@libs/common';
import { Type } from 'class-transformer';

export class AssignRolesDto {
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @Type(() => String)
  roles!: UserRole[];
}
