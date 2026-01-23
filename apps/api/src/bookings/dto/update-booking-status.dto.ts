import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../entities/booking.entity';

export class UpdateBookingStatusDto {
  @ApiProperty({
    description: 'The new status of the booking',
    enum: BookingStatus,
    example: BookingStatus.ACCEPTED,
  })
  @IsEnum(BookingStatus)
  @IsNotEmpty()
  status!: BookingStatus;
}
