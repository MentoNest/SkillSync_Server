import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleListingVisibilityDto {
  @ApiProperty({ description: 'Listing visibility status', example: false })
  @IsBoolean()
  isActive: boolean;
}
