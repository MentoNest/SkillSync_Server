import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FeatureMentorDto {
  @ApiProperty({
    description: 'Featured order for sorting (lower number = higher priority)',
    example: 1,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  featuredOrder?: number;
}

export class UpdateFeaturedOrderDto {
  @ApiProperty({
    description: 'New featured order for the mentor',
    example: 1,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  featuredOrder: number;
}

export class FeaturedMentorResponseDto {
  id: string;
  bio: string;
  yearsOfExperience: number;
  expertise: string[];
  preferredMentoringStyle: string[];
  availabilityHoursPerWeek: number;
  availabilityDetails: string;
  isFeatured: boolean;
  featuredAt: Date;
  featuredExpiresAt: Date;
  featuredOrder: number;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    displayName: string;
    walletAddress: string;
    avatarUrl: string;
    email: string;
  };
}

export class FeaturedMentorsPageDto {
  data: FeaturedMentorResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
