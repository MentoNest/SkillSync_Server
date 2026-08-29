import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileType } from '../entities/user.entity';
import { BasePaginationQueryDto } from '../../common/dtos/base-pagination-query.dto';

export class UserQueryDto extends BasePaginationQueryDto {
  constructor() {
    super();
    this.limit = 10; // Override default limit for this specific DTO
  }

  @ApiPropertyOptional({
    description: 'Filter users by profile type',
    enum: ProfileType,
    example: ProfileType.MENTOR,
  })
  @IsOptional()
  @IsEnum(ProfileType)
  profileType?: ProfileType;

  @ApiPropertyOptional({
    description: 'Search string for displayName, email, or walletAddress',
    example: 'Alex',
  })
  @IsOptional()
  @IsString()
  search?: string;
}