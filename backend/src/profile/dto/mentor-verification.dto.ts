import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MentorProfile } from '../mentor-profile.entity';

export enum VerificationMethod {
  EMAIL = 'email',
  ID = 'id',
  CREDENTIAL = 'credential',
}

export class VerifyMentorDto {
  @ApiProperty({
    description: 'Evidence type reviewed by the administrator.',
    enum: VerificationMethod,
    example: VerificationMethod.CREDENTIAL,
  })
  @IsEnum(VerificationMethod)
  method!: VerificationMethod;

  @ApiPropertyOptional({
    description:
      'Internal-only notes; never included in public profile responses.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class QueryMentorVerificationRequestsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class MentorVerificationRequestDto {
  @ApiProperty()
  mentorId!: string;

  @ApiProperty()
  walletAddress!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  requestedAt!: Date;

  static fromEntity(profile: MentorProfile): MentorVerificationRequestDto {
    return {
      mentorId: profile.id,
      walletAddress: profile.walletAddress,
      displayName:
        profile.user?.effectiveDisplayName ?? profile.walletAddress.slice(0, 8),
      requestedAt: profile.verificationRequestedAt as Date,
    };
  }
}

export class MentorVerificationRequestsPageDto {
  @ApiProperty({ type: [MentorVerificationRequestDto] })
  data!: MentorVerificationRequestDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
