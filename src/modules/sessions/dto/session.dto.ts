import { IsString, IsDateString, IsOptional, IsEnum, Min, Max, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ description: 'Mentor ID to book session with' })
  @IsString()
  mentorId: string;

  @ApiProperty({ description: 'Session start time in ISO format' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'Session end time in ISO format' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Session notes or agenda' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSessionStatusDto {
  @ApiProperty({ 
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    description: 'New session status'
  })
  @IsEnum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])
  status: string;
}

export class CancelSessionDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RescheduleSessionDto {
  @ApiProperty({ description: 'New session start time in ISO format' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'New session end time in ISO format' })
  @IsDateString()
  endTime: string;
}

export class RateSessionDto {
  @ApiProperty({ description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Review text' })
  @IsString()
  @IsOptional()
  review?: string;
}

export class SessionQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsEnum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
