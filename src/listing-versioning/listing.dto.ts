import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsUrl,
  IsInt,
  IsObject,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ListingCategory, ListingStatus } from '../entities/listing.entity';

// ─── Listing CRUD ────────────────────────────────────────────────────────────

export class CreateListingDto {
  @ApiProperty({ example: 'React + TypeScript Mentorship', maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Weekly 1-on-1 sessions covering React best practices.' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({ example: 49.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ enum: ListingCategory, default: ListingCategory.MENTORSHIP })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiPropertyOptional({ enum: ListingStatus, default: ListingStatus.DRAFT })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ example: ['react', 'typescript', 'frontend'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cover.jpg' })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional({ example: 'Bumped price after adding live code reviews.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

// ─── Version queries ──────────────────────────────────────────────────────────

export class VersionQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter versions created by a specific user (UUID)',
  })
  @IsOptional()
  @IsString()
  changedBy?: string;
}

export class CompareVersionsQueryDto {
  @ApiProperty({ description: 'First (earlier) version number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  v1: number;

  @ApiProperty({ description: 'Second (later) version number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  v2: number;
}

// ─── Revert ───────────────────────────────────────────────────────────────────

export class RevertVersionDto {
  @ApiPropertyOptional({
    example: 'Reverting back to v3 — the price hike caused a drop in inquiries.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
