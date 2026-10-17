import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RoleName } from '../../../rbac/roles';

export enum UserSortBy {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  RATING = 'rating',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/** Query string for GET /users (#1453). */
export class UserSearchQueryDto {
  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ description: 'Case-insensitive partial display-name match' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter mentors whose skills contain this value' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skill?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: UserSortBy, default: UserSortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(UserSortBy)
  sortBy = UserSortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder = SortOrder.DESC;
}
