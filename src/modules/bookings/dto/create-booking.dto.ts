import { IsString, IsNumber, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidDuration, DurationUnit } from '../../../common/decorators/duration.decorator';
import { BookingStatus } from '../entities/booking.entity';

export class CreateBookingDto {
  @ApiProperty({ description: 'Service listing ID to book' })
  @IsString()
  serviceListingId: string;

  @ApiProperty({ 
    description: 'Session duration in minutes (min: 15, max: 480)',
    example: 60,
  })
  @IsNumber()
  @IsValidDuration({ min: 15, max: 480, unit: DurationUnit.MINUTES })
  duration: number;

  @ApiProperty({ 
    description: 'Scheduled date and time for the session',
    example: '2024-01-15T14:00:00Z',
  })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ 
    description: 'Additional notes or requirements for the session',
    example: 'I need help with React hooks and state management',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ 
    description: 'Preferred meeting platform or link',
    example: 'Zoom or Google Meet',
  })
  @IsOptional()
  @IsString()
  meetingLink?: string;
}
