import { IsUUID, IsOptional, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BehaviorType } from '../entities/user-behavior.entity';

export class RecordBehaviorDto {
  @ApiProperty({ description: 'Service listing ID', format: 'uuid' })
  @IsUUID()
  listingId: string;

  @ApiProperty({ description: 'Type of user behavior', enum: BehaviorType })
  @IsEnum(BehaviorType)
  behaviorType: BehaviorType;

  @ApiPropertyOptional({ description: 'Additional metadata for the behavior' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class RecommendationResponseDto {
  @ApiProperty({ description: 'Recommended service listing' })
  listing: any;

  @ApiProperty({ description: 'Recommendation score' })
  score: number;
}

export class PersonalizedRecommendationsDto {
  @ApiPropertyOptional({ description: 'Number of recommendations to return', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class SimilarListingsDto {
  @ApiPropertyOptional({ description: 'Number of similar listings to return', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}

export class CategoryRecommendationsDto {
  @ApiPropertyOptional({ description: 'Number of recommendations to return', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
