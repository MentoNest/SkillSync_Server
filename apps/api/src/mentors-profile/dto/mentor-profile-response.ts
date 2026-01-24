import { ApiProperty } from '@nestjs/swagger';
import { MentorProfileStatus } from '../entities/mentors-profile.entity';

export class MentorProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Senior Software Engineer | Full-Stack Developer' })
  headline!: string;

  @ApiProperty({ example: 1500000, description: 'Rate in kobo' })
  rateMinor!: number;

  @ApiProperty({ example: 5 })
  yearsExp!: number;

  @ApiProperty({
    enum: MentorProfileStatus,
    example: MentorProfileStatus.DRAFT,
  })
  status!: MentorProfileStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
