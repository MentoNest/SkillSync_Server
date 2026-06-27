import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto';

export class SearchUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['mentor', 'mentee', 'admin'], description: 'Filter by role' })
  @IsOptional()
  @IsIn(['mentor', 'mentee', 'admin'], { message: 'role must be one of: mentor, mentee, admin' })
  role?: string;

  @ApiPropertyOptional({ description: 'Search term (username, displayName)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'search must not exceed 100 characters' })
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by skill name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'skill must not exceed 100 characters' })
  skill?: string;

  @ApiPropertyOptional({ enum: ['name', 'createdAt', 'rating'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'rating'], { message: 'sortBy must be one of: name, createdAt, rating' })
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder must be ASC or DESC' })
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
