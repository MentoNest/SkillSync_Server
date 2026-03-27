import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, Matches, IsOptional } from 'class-validator';

export class CreateSkillCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Web Development', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug (lowercase letters, numbers, hyphens only)',
    example: 'web-development',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  slug: string;

  @ApiPropertyOptional({ description: 'Optional category description', example: 'Skills related to building web applications' })
  @IsOptional()
  @IsString()
  description?: string;
}
