import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleDraftDto {
  @ApiProperty({ description: 'Draft status', example: false })
  @IsBoolean()
  isDraft: boolean;
}
