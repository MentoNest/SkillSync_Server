import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortfolioLinkResponseDto } from './portfolio-link.dto';

export class PublicProfileResponseDto {
  @ApiProperty({
    description: 'Stellar wallet address.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  walletAddress!: string;

  @ApiPropertyOptional({
    description: 'Unique username, null if not yet set.',
    example: 'alice_dev',
    nullable: true,
  })
  username!: string | null;

  @ApiProperty({
    description:
      'Display name. Returns the user-set display name, or the first 8 characters of the ' +
      'wallet address when none has been set.',
    example: 'Alice the Developer',
  })
  displayName!: string;

  @ApiProperty({ description: 'UTC timestamp of account creation.', example: '2024-01-15T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ type: [PortfolioLinkResponseDto], description: 'Public portfolio links' })
  portfolioLinks?: PortfolioLinkResponseDto[];

  @ApiPropertyOptional({ description: 'True when this user has an active featured mentor profile.' })
  isFeatured?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Badge shown on featured mentor cards.' })
  featuredBadge?: string | null;
}
