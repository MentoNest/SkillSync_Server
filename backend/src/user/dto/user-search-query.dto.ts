import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const USER_SEARCH_ROLES = ['mentor', 'mentee', 'admin'] as const;
export const USER_SORT_FIELDS = ['name', 'createdAt', 'rating'] as const;
export const USER_SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * #1173: Query parameters for GET /users.
 */
export class UserSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Filter users by role',
    enum: USER_SEARCH_ROLES,
    example: 'mentor',
  })
  @IsOptional()
  @IsIn(USER_SEARCH_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on display name',
    example: 'Alex',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter mentors whose skills array contains this value',
    example: 'Solidity',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skill?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (max 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort field (rating only applies to mentor profiles)',
    enum: USER_SORT_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS as unknown as string[])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: USER_SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(USER_SORT_ORDERS as unknown as string[])
  sortOrder?: string = 'desc';
}
