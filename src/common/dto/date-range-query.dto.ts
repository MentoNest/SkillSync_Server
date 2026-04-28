import { IsOptional, IsDateString } from 'class-validator';
import { IsAfterDate } from '../validators/is-after-date.validator';

/**
 * Reusable date range filter — extend or compose with other DTOs.
 */
export class DateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @IsAfterDate('startDate')
  endDate?: string;
}
