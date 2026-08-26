import { IsUUID, IsDateString, IsOptional, IsString, IsUrl, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookSessionDto {
  @ApiProperty({ description: 'Mentor user ID' })
  @IsUUID()
  mentorId: string;

  @ApiProperty({ description: 'Session start time (ISO 8601)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'Session end time (ISO 8601)' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Meeting URL (Zoom/Google Meet)' })
  @IsUrl()
  @IsOptional()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Session notes' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class RescheduleSessionDto {
  @ApiProperty({ description: 'New session start time (ISO 8601)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'New session end time (ISO 8601)' })
  @IsDateString()
  endTime: string;
}

export class CancelSessionDto {
  @ApiPropertyOptional({ description: 'Cancellation reason' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}

export class RateSessionDto {
  @ApiProperty({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Written review' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  review?: string;
}
