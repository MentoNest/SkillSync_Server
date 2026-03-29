import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { DayOfWeek } from '../entities/mentor-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── Create Availability Rule ────────────────────────────────────────────────

export class CreateAvailabilityDto {
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @Matches(TIME_REGEX, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  @Matches(TIME_REGEX, { message: 'endTime must be HH:mm (24-hour)' })
  endTime: string;

  /**
   * IANA timezone identifier.
   * Defaults to UTC if omitted.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  /** Slot duration in minutes. Must be between 15 and 480 (8 hours). */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  slotDurationMinutes?: number;

  /** Buffer/break between slots in minutes. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** ISO date string (YYYY-MM-DD). Rule is inactive before this date. */
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  /** ISO date string (YYYY-MM-DD). Rule expires after this date. */
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

// ─── Update Availability Rule ────────────────────────────────────────────────

export class UpdateAvailabilityDto {
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:mm (24-hour)' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:mm (24-hour)' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

// ─── Block Time ──────────────────────────────────────────────────────────────

export class BlockTimeDto {
  /** UTC ISO-8601 datetime when the block starts */
  @IsISO8601({ strict: true })
  startAt: string;

  /** UTC ISO-8601 datetime when the block ends */
  @IsISO8601({ strict: true })
  endAt: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Query Available Slots ───────────────────────────────────────────────────

export class QuerySlotsDto {
  /** YYYY-MM-DD date to query available slots for */
  @IsDateString()
  date: string;

  /**
   * Optional override for slot duration (minutes).
   * If omitted, the rule's slotDurationMinutes is used.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

// ─── Query Date Range ────────────────────────────────────────────────────────

export class QueryRangeDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
