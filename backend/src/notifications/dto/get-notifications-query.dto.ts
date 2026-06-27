import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto';

export class GetNotificationsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by notification type',
    enum: ['session_reminder', 'new_message', 'profile_verified', 'suspension_warning', 'announcement'],
  })
  @IsOptional()
  @IsIn(
    ['session_reminder', 'new_message', 'profile_verified', 'suspension_warning', 'announcement'],
    { message: 'type must be a valid notification type' },
  )
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by read status', enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'read must be "true" or "false"' })
  read?: string;
}
