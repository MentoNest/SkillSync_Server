import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export type UserRole = 'mentor' | 'mentee' | 'admin';
export type SortField = 'name' | 'createdAt' | 'rating';
export type SortOrder = 'asc' | 'desc';

export class SearchUsersDto {
  @IsOptional()
  @IsIn(['mentor', 'mentee', 'admin'])
  role?: UserRole;

  @IsOptional()
  @IsString()
  search?: string; // partial match on displayName (ILIKE)

  @IsOptional()
  @IsString()
  skill?: string; // filter mentors by skill

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'rating'])
  sortBy?: SortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder = 'desc';
}

export interface SearchUsersResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
