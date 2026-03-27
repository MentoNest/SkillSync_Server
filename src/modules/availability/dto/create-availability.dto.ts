import { IsEnum, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DayOfWeek } from '../entities/mentor-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityDto {
  @ApiProperty({
    enum: DayOfWeek,
    example: DayOfWeek.MONDAY,
    description: 'Day of the week for the availability slot',
  })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty({
    example: '09:00',
    description: 'Start time in HH:MM 24-hour format (in your profile timezone)',
  })
  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:MM 24-hour format (e.g. "09:00")' })
  startTime: string;

  @ApiProperty({
    example: '11:00',
    description: 'End time in HH:MM 24-hour format (in your profile timezone)',
  })
  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:MM 24-hour format (e.g. "11:00")' })
  endTime: string;
}
