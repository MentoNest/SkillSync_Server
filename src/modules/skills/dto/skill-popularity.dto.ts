import { IsNumber, IsOptional, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PopularityEventType } from '../entities/skill-popularity-daily.entity';

export class RecordEventDto {
  @ApiProperty({ description: 'Skill ID' })
  @Type(() => Number)
  @IsNumber()
  skillId: number;

  @ApiPropertyOptional({
    description: 'Event type (defaults to skill_page_view)',
    enum: PopularityEventType,
    default: PopularityEventType.SKILL_PAGE_VIEW,
  })
  @IsOptional()
  @IsEnum(PopularityEventType)
  eventType?: PopularityEventType = PopularityEventType.SKILL_PAGE_VIEW;
}

export class PopularityQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to analyze', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  days?: number = 30;

  @ApiPropertyOptional({ description: 'Decay factor for recent activity weighting', default: 0.9 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  decayFactor?: number = 0.9;
}

export class TrendingQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to analyze', default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  days?: number = 7;

  @ApiPropertyOptional({ description: 'Maximum number of results', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Decay factor for recent activity weighting', default: 0.9 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  decayFactor?: number = 0.9;
}

export class PopularitySummaryQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to analyze', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  days?: number = 30;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
