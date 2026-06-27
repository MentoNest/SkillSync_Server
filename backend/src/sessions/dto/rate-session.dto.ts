import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RateSessionDto {
  @ApiProperty({ description: 'Rating from 1 (worst) to 5 (best)', minimum: 1, maximum: 5 })
  @IsInt({ message: 'rating must be an integer' })
  @Min(1, { message: 'rating must be at least 1' })
  @Max(5, { message: 'rating must not exceed 5' })
  rating: number;

  @ApiPropertyOptional({ description: 'Optional review comment', maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'comment must be a string' })
  @MaxLength(1000, { message: 'comment must not exceed 1000 characters' })
  comment?: string;
}
