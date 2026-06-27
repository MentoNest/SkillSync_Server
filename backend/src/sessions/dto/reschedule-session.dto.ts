import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';
import { IsAfterDate } from '../../common/validators';

export class RescheduleSessionDto {
  @ApiProperty({ description: 'New session start time (ISO 8601)', example: '2025-09-02T10:00:00Z' })
  @IsDateString({}, { message: 'startTime must be a valid ISO 8601 date string' })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'New session end time (ISO 8601), must be after startTime', example: '2025-09-02T11:00:00Z' })
  @IsDateString({}, { message: 'endTime must be a valid ISO 8601 date string' })
  @IsAfterDate('startTime', { message: 'endTime must be after startTime' })
  @IsNotEmpty()
  endTime: string;
}
