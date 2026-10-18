import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class SuspendUserDto {
  @ApiProperty({ example: 'Repeated harassment reports', maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason!: string;

  /** Omit (or pass null) for a permanent suspension. */
  @ApiPropertyOptional({ example: 7, description: 'Suspension length in days; omit for permanent' })
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}
