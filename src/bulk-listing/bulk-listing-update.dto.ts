import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ListingStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft',
  ARCHIVED = 'archived',
}

export class ListingUpdateItemDto {
  @ApiProperty({ description: 'UUID of the listing to update' })
  @IsUUID('4')
  id: string;

  @ApiPropertyOptional({ description: 'Listing title', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Listing description', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ description: 'Price in minor units (e.g. kobo)', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Category / skill tag' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Whether the listing is featured' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Max number of mentees' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxMentees?: number;
}

export class BulkListingUpdateDto {
  @ApiProperty({
    type: [ListingUpdateItemDto],
    description: 'List of listing patches (1–100 items per request)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ListingUpdateItemDto)
  updates: ListingUpdateItemDto[];
}

// ─── Response shapes ────────────────────────────────────────────────────────

export class ListingUpdateResultDto {
  @ApiProperty() id: string;
  @ApiProperty() success: boolean;
  @ApiPropertyOptional() error?: string;
}

export class BulkListingUpdateResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() succeeded: number;
  @ApiProperty() failed: number;
  @ApiProperty({ type: [ListingUpdateResultDto] }) results: ListingUpdateResultDto[];
}
