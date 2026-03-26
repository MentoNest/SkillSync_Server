import { IsString, IsNumber, IsEnum, IsOptional, IsInt, Min, Max, MaxLength, Matches } from 'class-validator';
import { IsValidPrice } from '../../../common/decorators/price.decorator';
import { IsString, IsNumber, IsEnum, IsOptional, MaxLength, Matches } from 'class-validator';
import { IsValidPrice } from '../../../common/decorators/price.decorator';
import { IsString, IsNumber, IsEnum, IsOptional, MaxLength, Matches, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ServiceCategory } from '../entities/service-listing.entity';
import { IsValidDuration, DurationUnit } from '../../../common/decorators/duration.decorator';

export class CreateServiceListingDto {
  @ApiProperty({ description: 'Service listing title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'SEO-friendly slug (auto-generated from title if not provided)',
    example: 'advanced-typescript-mentorship',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  slug?: string;

  @ApiProperty({ description: 'Service listing description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Service price (min: 0, max: 10000)' })
  @IsNumber()
  @IsValidPrice({ min: 0, max: 10000 })
  price: number;

  @ApiPropertyOptional({ 
    description: 'Service duration in hours (min: 0.5, max: 24)',
    example: 1.5,
  })
  @IsOptional()
  @IsNumber()
  @IsValidDuration({ min: 0.5, max: 24, unit: DurationUnit.HOURS })
  duration?: number;

  @ApiProperty({ description: 'Service category' })
  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @ApiPropertyOptional({ description: 'Service listing image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Maximum number of mentees allowed (1–100)', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxMentees?: number;
  @ApiPropertyOptional({ description: 'Tags to associate with this listing (array of tag slugs)', example: ['typescript', 'nodejs', 'web-development'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
