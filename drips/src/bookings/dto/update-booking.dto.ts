import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BookingStatus } from '../entities/booking.entity';

export class UpdateBookingDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
