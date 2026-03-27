import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';
import { BookingStatus } from '../entities/booking.entity';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {
  @ApiPropertyOptional({ description: 'Booking status', enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
