import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsTimeFormat, IsDateFormat, IsValidTimezone, IsAfterDate } from '../../common/validators/custom-validators';

export class CreateSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsTimeFormat()
  startTime!: string;

  @IsTimeFormat()
  @IsAfterDate('startTime')
  endTime!: string;

  @IsOptional()
  @IsValidTimezone()
  @IsString()
  timezone?: string;
}

export class UpdateSlotDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsTimeFormat()
  startTime?: string;

  @IsOptional()
  @IsTimeFormat()
  @IsAfterDate('startTime')
  endTime?: string;

  @IsOptional()
  @IsValidTimezone()
  @IsString()
  timezone?: string;
}

export class CreateExceptionDto {
  @IsDateFormat()
  exceptionDate!: string;

  @IsOptional()
  @IsTimeFormat()
  startTime?: string;

  @IsOptional()
  @IsTimeFormat()
  @IsAfterDate('startTime')
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
