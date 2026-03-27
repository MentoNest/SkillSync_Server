import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleFeaturedDto {
  @ApiProperty({ description: 'Featured status', example: true })
  @IsBoolean()
  isFeatured: boolean;
}
