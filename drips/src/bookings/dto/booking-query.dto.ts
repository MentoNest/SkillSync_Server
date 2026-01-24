import { IsEnum, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { BookingStatus } from '../entities/booking.entity';

export class BookingQueryDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsUUID()
  @IsOptional()
  mentorId?: string;

  @IsUUID()
  @IsOptional()
  menteeId?: string;
}
