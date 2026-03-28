import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, Matches, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Normalizes a string: trims whitespace and collapses multiple spaces
 */
function normalizeSpaces(value: string): string {
  if (!value) return value;
  return value.trim().replace(/\s+/g, ' ');
}

export class CreateSkillDto {
  @ApiProperty({ description: 'Skill name', example: 'TypeScript', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => normalizeSpaces(value))
  name: string;

  @ApiPropertyOptional({
    description: 'URL-friendly slug (lowercase letters, numbers, hyphens only). If not provided, will be generated from name.',
    example: 'typescript',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  slug?: string;

  @ApiPropertyOptional({ description: 'Optional skill description', example: 'A strongly typed superset of JavaScript' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'UUID of the category this skill belongs to' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
