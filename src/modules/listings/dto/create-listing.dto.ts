import { IsString, IsOptional, IsArray, IsNumber, IsUrl, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListingType } from '../entities/listing.entity';

export class CreateListingDto {
  @ApiPropertyOptional({ description: 'Listing title', example: 'Senior React Developer offering mentorship' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the listing' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Type of listing', enum: ListingType })
  @IsOptional()
  @IsEnum(ListingType)
  type?: ListingType;

  @ApiPropertyOptional({ description: 'Skills or expertise offered', example: ['React', 'TypeScript', 'Node.js'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate', example: 50 })
  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Whether the listing is currently available' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  profileImageUrl?: string;
}
