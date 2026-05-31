import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsISODate } from '../../common/validators/custom-validators';
import { Type } from 'class-transformer';

export class CheckAvailabilityQueryDto {
  @IsISODate()
  @IsNotEmpty()
  dateTime: string;
}

export class ProfileHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsString()
  limit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsString()
  offset?: string;
}
