import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'UUID of the listing to book' })
  @IsUUID()
  @IsNotEmpty()
  listingId: string;

  @ApiProperty({
    description: 'ISO 8601 start time (with timezone)',
    example: '2025-06-01T10:00:00Z',
  })
  @IsDateString({ strict: true })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'ISO 8601 end time (with timezone)',
    example: '2025-06-01T11:00:00Z',
  })
  @IsDateString({ strict: true })
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({ description: 'Optional notes from mentee' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CheckConflictDto {
  @ApiProperty()
  @IsUUID()
  listingId: string;

  @ApiProperty({ example: '2025-06-01T10:00:00Z' })
  @IsDateString({ strict: true })
  startTime: string;

  @ApiProperty({ example: '2025-06-01T11:00:00Z' })
  @IsDateString({ strict: true })
  endTime: string;

  /** Optionally exclude a booking ID (for reschedule flows) */
  @ApiPropertyOptional({ description: 'Booking ID to exclude (reschedule)' })
  @IsOptional()
  @IsUUID()
  excludeBookingId?: string;
}

export class ConflictResponseDto {
  @ApiProperty()
  hasConflict: boolean;

  @ApiProperty({ type: () => [ConflictingSlotDto] })
  conflicts: ConflictingSlotDto[];

  @ApiPropertyOptional()
  message?: string;
}

export class ConflictingSlotDto {
  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  endTime: Date;

  @ApiProperty()
  status: string;

  @ApiProperty()
  menteeId: string;
}
