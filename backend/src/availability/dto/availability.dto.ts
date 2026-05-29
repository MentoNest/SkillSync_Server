import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_REGEX)
  startTime!: string;

  @Matches(TIME_REGEX)
  endTime!: string;

  @IsOptional()
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
  @Matches(TIME_REGEX)
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX)
  endTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateExceptionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  exceptionDate!: string;

  @IsOptional()
  @Matches(TIME_REGEX)
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX)
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
