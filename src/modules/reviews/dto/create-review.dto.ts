import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Listing identifier' })
  @IsUUID()
  listingId: string;

  @ApiProperty({ description: 'Rating score from 1 to 5', example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Optional review comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}
