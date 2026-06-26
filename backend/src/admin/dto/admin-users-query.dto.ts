import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto';

export class AdminUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by username, email, or wallet address', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['mentor', 'mentee', 'admin'], description: 'Filter by role' })
  @IsOptional()
  @IsIn(['mentor', 'mentee', 'admin'], { message: 'role must be one of: mentor, mentee, admin' })
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended'], description: 'Filter by account status' })
  @IsOptional()
  @IsIn(['active', 'suspended'], { message: 'status must be active or suspended' })
  status?: string;
}
