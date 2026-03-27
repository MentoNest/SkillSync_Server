import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookmarkDto {
  @ApiPropertyOptional({ description: 'Optional notes for the bookmark' })
  @IsOptional()
  @IsString()
  notes?: string;
}
