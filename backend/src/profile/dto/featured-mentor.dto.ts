import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MentorProfile } from '../mentor-profile.entity';

export class FeatureMentorDto {
  @ApiPropertyOptional({
    description: 'Manual display position (lower first). Defaults to the next available slot.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  featuredOrder?: number;
}

export class QueryFeaturedMentorsDto {
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

export class FeaturedMentorDto {
  @ApiProperty()
  walletAddress!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  bio!: string;

  @ApiProperty({ type: [String] })
  skills!: string[];

  @ApiPropertyOptional({ nullable: true })
  hourlyRateUsdCents!: number | null;

  @ApiProperty({ description: 'Always true for entries in this collection.', example: true })
  isFeatured!: boolean;

  @ApiProperty({ description: 'Badge shown on mentor cards and profiles.', example: 'Featured' })
  badge!: string;

  @ApiProperty()
  featuredAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  featuredOrder!: number | null;

  static fromEntity(profile: MentorProfile): FeaturedMentorDto {
    return {
      walletAddress: profile.walletAddress,
      displayName: profile.user?.effectiveDisplayName ?? profile.walletAddress.slice(0, 8),
      avatarUrl: profile.user?.avatarUrl ?? null,
      bio: profile.bio,
      skills: profile.skills,
      hourlyRateUsdCents: profile.hourlyRateUsdCents,
      isFeatured: true,
      badge: 'Featured',
      featuredAt: (profile.featuredAt ?? profile.updatedAt) as Date,
      featuredOrder: profile.featuredOrder,
    };
  }
}

export class FeaturedMentorsPageDto {
  @ApiProperty({ type: [FeaturedMentorDto] })
  data!: FeaturedMentorDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
