import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({
    description: 'The ID of the mentor to book with',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  mentorId: string;

  @ApiProperty({
    description: 'The start time of the booking',
    example: '2026-01-25T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'The end time of the booking',
    example: '2026-01-25T11:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Optional notes for the booking',
    example: 'I want to discuss NestJS Swagger implementation',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
