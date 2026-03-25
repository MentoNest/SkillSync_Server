import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Represents a skill suggestion when a duplicate is detected
 */
export class SkillSuggestionDto {
  @ApiProperty({ description: 'Skill ID' })
  id: string;

  @ApiProperty({ description: 'Skill name' })
  name: string;

  @ApiProperty({ description: 'Skill slug' })
  slug: string;

  @ApiPropertyOptional({ description: 'Similarity score (0-1)', example: 0.85 })
  similarity?: number;
}

/**
 * Response returned when a duplicate skill is detected
 */
export class DuplicateSkillResponseDto {
  @ApiProperty({ description: 'Error message' })
  message: string;

  @ApiProperty({ description: 'Type of duplicate detected', enum: ['exact', 'normalized', 'similar'] })
  duplicateType: 'exact' | 'normalized' | 'similar';

  @ApiProperty({ description: 'Suggested existing skills', type: [SkillSuggestionDto] })
  suggestions: SkillSuggestionDto[];
}
