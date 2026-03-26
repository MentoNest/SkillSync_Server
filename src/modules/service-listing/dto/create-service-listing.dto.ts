import { IsString, IsNumber, IsEnum, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ServiceCategory } from '../entities/service-listing.entity';

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

  @ApiProperty({ description: 'Service price' })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ description: 'Service duration in hours' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiProperty({ description: 'Service category' })
  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @ApiPropertyOptional({ description: 'Service listing image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
