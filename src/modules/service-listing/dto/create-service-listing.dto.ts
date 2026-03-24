import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '../entities/service-listing.entity';

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
