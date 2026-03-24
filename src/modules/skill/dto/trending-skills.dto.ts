// src/modules/skills/dto/trending-skills.dto.ts

import { IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TrendingSkillsQueryDto {
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  window: '24h' | '7d' | '30d' = '7d';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}