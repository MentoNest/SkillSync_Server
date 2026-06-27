import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsAfterDate } from '../../common/validators';

export class CreateSessionDto {
  @ApiProperty({ description: 'UUID of the mentor', format: 'uuid' })
  @IsUUID('4', { message: 'mentorId must be a valid UUID' })
  @IsNotEmpty()
  mentorId: string;

  @ApiProperty({ description: 'UUID of the mentee', format: 'uuid' })
  @IsUUID('4', { message: 'menteeId must be a valid UUID' })
  @IsNotEmpty()
  menteeId: string;

  @ApiProperty({ description: 'Session start time (ISO 8601)', example: '2025-09-01T10:00:00Z' })
  @IsDateString({}, { message: 'startTime must be a valid ISO 8601 date string' })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'Session end time (ISO 8601), must be after startTime', example: '2025-09-01T11:00:00Z' })
  @IsDateString({}, { message: 'endTime must be a valid ISO 8601 date string' })
  @IsAfterDate('startTime', { message: 'endTime must be after startTime' })
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({ description: 'Optional notes for the session' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional meeting URL' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;
}
