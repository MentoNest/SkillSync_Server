import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO used by POST /user/profile/portfolio-links.
 *
 * Validation:
 *   - title: non-empty, <= 50 chars, no '<' or '>' to defeat basic HTML injection
 *   - url:   must be a syntactically valid URL using the `https` protocol only,
 *            a max of 2048 chars so we don't blow up Postgres VARCHAR limits
 */
export class CreatePortfolioLinkDto {
  @ApiProperty({
    example: 'GitHub',
    description: 'Display label for the link. Must not contain angle brackets.',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[^<>]+$/, {
    message: 'Title cannot contain angle brackets (HTML tags are not allowed)',
  })
  title: string;

  @ApiProperty({
    example: 'https://github.com/handle',
    description: 'Absolute HTTPS URL pointing to an external portfolio item.',
    maxLength: 2048,
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
}
