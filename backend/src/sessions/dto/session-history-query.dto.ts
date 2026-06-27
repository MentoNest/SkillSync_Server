import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto';

export class SessionHistoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter sessions by status',
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'],
  })
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'], {
    message: 'status must be one of: pending, confirmed, cancelled, completed, rescheduled',
  })
  status?: string;
}
