import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import {
  IsAfterDate,
  IsIsoDateTime,
  IsValidWalletAddress,
} from '../../common/validators';
import {
  MAX_RATING,
  MIN_RATING,
  SessionRole,
  SessionStatus,
} from '../session-rules';

export class BookSessionDto {
  @ApiProperty({
    description: 'Stellar wallet address of the mentor.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @IsValidWalletAddress()
  mentorId!: string;

  @ApiProperty({
    description: 'ISO 8601 session start in UTC.',
    example: '2030-01-02T10:00:00.000Z',
  })
  @IsIsoDateTime()
  startTime!: string;

  @ApiProperty({
    description: 'ISO 8601 session end in UTC.',
    example: '2030-01-02T11:00:00.000Z',
  })
  @IsIsoDateTime()
  @IsAfterDate('startTime')
  endTime!: string;

  @ApiPropertyOptional({
    description: 'Optional notes for the mentor.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RescheduleSessionDto {
  @ApiProperty({
    description: 'New ISO 8601 session start in UTC.',
    example: '2030-01-03T10:00:00.000Z',
  })
  @IsIsoDateTime()
  startTime!: string;

  @ApiProperty({
    description: 'New ISO 8601 session end in UTC.',
    example: '2030-01-03T11:00:00.000Z',
  })
  @IsIsoDateTime()
  @IsAfterDate('startTime')
  endTime!: string;
}

export class CancelSessionDto {
  @ApiPropertyOptional({
    description: 'Reason for cancelling.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RateSessionDto {
  @ApiProperty({
    description: 'Rating from 1 to 5.',
    minimum: MIN_RATING,
    maximum: MAX_RATING,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATING)
  @Max(MAX_RATING)
  rating!: number;

  @ApiPropertyOptional({
    description: 'Optional written review.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review?: string;
}

export class QuerySessionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by session status.',
    enum: SessionStatus,
  })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional({
    description: 'Filter by participation as mentor or mentee.',
    enum: SessionRole,
  })
  @IsOptional()
  @IsEnum(SessionRole)
  role?: SessionRole;

  @ApiPropertyOptional({
    description: 'Only sessions starting at or after this ISO 8601 timestamp.',
  })
  @IsOptional()
  @IsIsoDateTime()
  from?: string;

  @ApiPropertyOptional({
    description: 'Only sessions starting before this ISO 8601 timestamp.',
  })
  @IsOptional()
  @IsIsoDateTime()
  to?: string;

  @ApiPropertyOptional({
    description: 'Field to sort by.',
    enum: ['startTime', 'createdAt', 'status', 'rating'],
    default: 'startTime',
  })
  @IsOptional()
  @IsIn(['startTime', 'createdAt', 'status', 'rating'])
  sortBy?: 'startTime' | 'createdAt' | 'status' | 'rating';
}
