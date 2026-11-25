import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailabilitySlotResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() mentorId!: string;
  @ApiProperty({ minimum: 0, maximum: 6 }) dayOfWeek!: number;
  @ApiProperty({ example: '10:00' }) startTimeUtc!: string;
  @ApiProperty({ example: '12:00' }) endTimeUtc!: string;
  @ApiProperty({ example: 'UTC' }) timezone!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AvailabilityExceptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() mentorId!: string;
  @ApiProperty({ example: '2026-12-25' }) date!: string;
  @ApiProperty({ example: '00:00' }) startTimeUtc!: string;
  @ApiProperty({ example: '23:59' }) endTimeUtc!: string;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty() isUnavailable!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AvailableWindowDto {
  @ApiProperty({ example: '2026-11-23T10:00:00.000Z' })
  startUtc!: string;

  @ApiProperty({ example: '2026-11-23T12:00:00.000Z' })
  endUtc!: string;

  @ApiProperty({
    description: 'Display start in the response timezone.',
    example: '11/23/2026, 10:00 GMT+0',
  })
  displayStart!: string;

  @ApiProperty({
    description: 'Display end in the response timezone.',
    example: '11/23/2026, 12:00 GMT+0',
  })
  displayEnd!: string;

  @ApiProperty({ example: 'UTC' })
  timezone!: string;

  @ApiProperty({ description: 'Source weekly slot ID.', example: 'uuid' })
  slotId!: string;
}

export class AvailabilityCheckResponseDto {
  @ApiProperty() mentorId!: string;
  @ApiProperty({
    description: 'IANA timezone used for display.',
    example: 'UTC',
  })
  timezone!: string;
  @ApiProperty({
    description: 'The checked instant in UTC.',
    example: '2026-11-23T10:30:00.000Z',
  })
  dateTime!: string;
  @ApiProperty() available!: boolean;
}

export class Next30DaysAvailabilityResponseDto {
  @ApiProperty() mentorId!: string;
  @ApiProperty({
    description: 'IANA timezone used for display.',
    example: 'UTC',
  })
  timezone!: string;
  @ApiProperty({ type: [AvailableWindowDto] })
  windows!: AvailableWindowDto[];
}
