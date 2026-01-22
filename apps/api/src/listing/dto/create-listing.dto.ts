import {
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateListingDto {
  @ApiProperty({
    description: 'Listing title',
    minLength: 5,
    maxLength: 120,
    example: 'Full-Stack Web Development Mentorship',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @ApiProperty({
    description: 'Detailed description of the mentorship offering',
    maxLength: 8000,
    example:
      'I offer comprehensive mentorship in full-stack development covering React, Node.js, and PostgreSQL.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  description!: string;

  @ApiProperty({
    description: 'Hourly rate in minor units (kobo for NGN)',
    minimum: 0,
    example: 500000,
  })
  @IsInt()
  @Min(0)
  hourlyRateMinorUnits!: number;

  @ApiProperty({
    description: 'Array of skill IDs associated with this listing',
    type: [String],
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds!: string[];

  @ApiProperty({
    description: 'Whether the listing is active',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
