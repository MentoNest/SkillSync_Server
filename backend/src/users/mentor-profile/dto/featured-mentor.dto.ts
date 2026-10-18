import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/dto/pagination-query.dto';
import { EmptyStringToUndefined } from '../../../common/validators/transform.decorators';

/** Query for the public `GET /mentors/featured` listing (#1459). */
export class FeaturedMentorQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to mentors verified by an admin' })
  @IsOptional()
  @Type(() => String)
  @EmptyStringToUndefined()
  verifiedOnly?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Restrict to mentors rated at least this much' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRating?: number;
}

/** Body for reordering the featured list from the admin drag-and-drop UI (#1459). */
export class ReorderFeaturedMentorsDto {
  @ApiProperty({
    type: [String],
    description: 'Mentor user ids in their intended display order',
    example: ['3f1b1c7e-0b1a-4d3e-9f2a-1b2c3d4e5f60', '9a22b3c4-1d2e-4f50-8a61-2b3c4d5e6f70'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'order must contain at least one mentor id' })
  @ArrayUnique({ message: 'order must not repeat a mentor id' })
  @IsString({ each: true })
  @IsUUID('4', { each: true, message: 'order entries must be mentor user ids' })
  order!: string[];
}

/** Single featured-mentor summary returned by the public endpoint. */
export class FeaturedMentorDto {
  @ApiPropertyOptional({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional()
  bio!: string | null;

  @ApiPropertyOptional({ type: [String] })
  skills!: string[];

  @ApiPropertyOptional({ type: [String] })
  expertiseAreas!: string[];

  @ApiPropertyOptional()
  averageRating!: number;

  @ApiPropertyOptional()
  reviewCount!: number;

  @ApiPropertyOptional()
  hourlyRate!: number;

  @ApiPropertyOptional()
  isVerified!: boolean;

  @ApiPropertyOptional({ description: 'Displayed as a "Featured" badge in the UI' })
  isFeatured!: boolean;

  @ApiPropertyOptional({ nullable: true })
  featuredAt!: Date | null;

  @ApiPropertyOptional()
  featuredOrder!: number;
}