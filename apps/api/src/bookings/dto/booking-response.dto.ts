import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../entities/booking.entity';

export class BookingResponseDto {
  @ApiProperty({ description: 'The unique identifier of the booking' })
  id!: string;

  @ApiProperty({ description: 'The ID of the mentor profile' })
  mentorProfileId!: string;

  @ApiProperty({ description: 'The ID of the mentee user' })
  menteeUserId!: string;

  @ApiProperty({ description: 'The start time of the booking' })
  start!: Date;

  @ApiProperty({ description: 'The end time of the booking' })
  end!: Date;

  @ApiProperty({
    enum: BookingStatus,
    description: 'The status of the booking',
  })
  status!: BookingStatus;

  @ApiProperty({ description: 'The date the booking was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date the booking was last updated' })
  updatedAt!: Date;
}
