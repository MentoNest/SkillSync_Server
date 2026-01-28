import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryMentorProfileDto {
  @ApiPropertyOptional({ 
    description: 'Filter by expertise/headline (partial match)',
    example: 'JavaScript' 
  })
  @IsOptional()
  @IsString()
  expertise?: string;

  @ApiPropertyOptional({ 
    description: 'Minimum hourly rate in NGN',
    example: 5000 
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ 
    description: 'Maximum hourly rate in NGN',
    example: 50000 
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ 
    description: 'Page number',
    example: 1,
    default: 1 
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ 
    description: 'Items per page',
    example: 10,
    default: 10 
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;
}