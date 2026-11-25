import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { CompletenessResult } from '../profile-completeness.calculator';

export class MissingFieldDto {
  @ApiProperty({ description: 'Machine-readable field name.', example: 'bio' })
  field!: string;

  @ApiProperty({
    description: 'Human-readable explanation.',
    example: 'Add a professional bio.',
  })
  description!: string;
}

export class ProfileCompletenessDto implements CompletenessResult {
  @ApiProperty({ enum: ['mentor', 'mentee'] })
  profileType!: 'mentor' | 'mentee';

  @ApiProperty({
    description: 'Final score including optional-field bonus (0–110).',
    example: 85,
  })
  score!: number;

  @ApiProperty({
    description: 'Required-field-only score (0–100).',
    example: 80,
  })
  baseScore!: number;

  @ApiProperty({
    description: 'Extra points from optional fields (0–10).',
    example: 5,
  })
  bonusPoints!: number;

  @ApiProperty({ type: [MissingFieldDto] })
  missingFields!: MissingFieldDto[];

  @ApiProperty({
    type: [String],
    description: 'Suggestions for incomplete profiles (<80%).',
  })
  suggestions!: string[];

  @ApiProperty()
  calculatedAt!: string;

  @ApiPropertyOptional({
    description: 'True when this response came from the 5-minute cache.',
  })
  cached?: boolean;

  @ApiPropertyOptional({
    description: 'Wallet address; only present in the admin listing.',
  })
  walletAddress?: string;
}

export class CompletenessAdminQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CompletenessAdminPageDto {
  @ApiProperty({ type: [ProfileCompletenessDto] })
  data!: ProfileCompletenessDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
