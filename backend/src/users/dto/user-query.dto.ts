import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RoleName } from '../../rbac/roles';
import { UserStatus } from '../entities/user.entity';

export class UserQueryDto {
  @ApiPropertyOptional({ example: 'alice' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsIn([RoleName.ADMIN, RoleName.MENTOR, RoleName.MENTEE])
  role?: RoleName;

  @ApiPropertyOptional({ enum: ['active', 'pending', 'suspended', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'pending', 'suspended', 'deleted'])
  status?: UserStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
