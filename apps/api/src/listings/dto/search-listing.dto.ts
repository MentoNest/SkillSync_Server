import {
  IsOptional,
  IsArray,
  IsUUID,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SearchListingsDto {
  @ApiProperty({
    description: 'Filter by skill IDs (AND logic)',
    type: [String],
    required: false,
    isArray: true,
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (Array.isArray(value)) return value;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return [value];
  })
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds?: string[];

  @ApiProperty({
    description: 'Minimum hourly rate in minor units',
    required: false,
    minimum: 0,
    example: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRate?: number;

  @ApiProperty({
    description: 'Maximum hourly rate in minor units',
    required: false,
    minimum: 0,
    example: 1000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRate?: number;

  @ApiProperty({
    description: 'Filter by active status',
    required: false,
    default: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Page number',
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    default: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
