import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAvailabilityDto } from './create-availability.dto';
import { DayOfWeek } from '../entities/mentor-availability.entity';

export class UpdateAvailabilityDto extends PartialType(CreateAvailabilityDto) {
  @ApiPropertyOptional({ description: 'Day of the week for the availability slot' })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ description: 'Start time in HH:MM' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time in HH:MM' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Activate or deactivate the slot without deleting it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
