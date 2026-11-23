import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { UserStatus } from '../user-status.enum';

/**
 * List-users query. Pagination parameters come from the shared DTO so every
 * paginated endpoint documents the same `page`, `limit`, `order` and `cursor`
 * parameters in Swagger (#1693, #1692).
 */
export class QueryUserDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Search by username/displayName prefix' })
  @IsOptional()
  @IsString()
  search?: string;
}
