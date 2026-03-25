import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '../entities/service-listing.entity';
import { IsValidDuration, DurationUnit } from '../../../common/decorators/duration.decorator';

export class CreateServiceListingDto {
  @ApiProperty({ description: 'Service listing title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Service listing description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Service price' })
  @IsNumber()
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
}
