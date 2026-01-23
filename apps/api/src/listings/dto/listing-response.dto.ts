import { ApiProperty } from '@nestjs/swagger';

export class SkillDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MentorProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;
}

export class ListingResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  hourlyRateMinorUnits!: number;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: [SkillDto] })
  skills!: SkillDto[];

  @ApiProperty({ type: MentorProfileDto })
  mentorProfile!: MentorProfileDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedListingsResponseDto {
  @ApiProperty({ type: [ListingResponseDto] })
  items!: ListingResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
