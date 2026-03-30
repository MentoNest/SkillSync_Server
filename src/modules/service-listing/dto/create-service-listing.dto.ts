import { IsString, IsNumber, IsEnum, IsOptional, IsInt, Min, Max, MaxLength, Matches, IsArray, IsBoolean } from 'class-validator';
import { IsValidPrice } from '../../../common/decorators/price.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ServiceCategory } from '../entities/service-listing.entity';
import { CurrencyCode } from '../../../common/enums/currency-code.enum';
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

  @ApiPropertyOptional({ description: 'Currency for service price', enum: CurrencyCode, example: CurrencyCode.USD })
  @IsOptional()
  @IsEnum(CurrencyCode)
  @Transform(({ value }) => value?.trim().toUpperCase())
  currency?: CurrencyCode;

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

  @ApiPropertyOptional({ description: 'Save as draft (not visible publicly)', example: false })
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @ApiPropertyOptional({ description: 'Tags to associate with this listing (array of tag slugs)', example: ['typescript', 'nodejs', 'web-development'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'SEO meta title for search engines (max 500 characters)', example: 'Expert TypeScript Mentorship | Senior Developer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'SEO meta description for search engines', example: 'Get personalized mentorship in TypeScript, Node.js, and modern web development from a senior developer with 10+ years of experience.' })
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'SEO meta keywords for search engines (comma-separated)', example: 'typescript,mentorship,nodejs,web-development,programming' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  metaKeywords?: string;
}
