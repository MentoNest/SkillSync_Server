import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** The three accepted ways an admin can vouch for a mentor. */
export enum VerificationMethod {
  EMAIL = 'email',
  ID = 'id',
  CREDENTIAL = 'credential',
}

export class VerifyMentorDto {
  @ApiProperty({ enum: VerificationMethod, description: 'At least one method is required' })
  @IsEnum(VerificationMethod)
  method!: VerificationMethod;

  @ApiPropertyOptional({ description: 'Internal notes (never shown publicly)', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RequestVerificationDto {
  @ApiPropertyOptional({ description: 'Optional note for the reviewing admin', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class MentorVerificationStatusDto {
  @ApiProperty()
  mentorId!: string;

  @ApiProperty()
  isVerified!: boolean;

  @ApiPropertyOptional({ nullable: true })
  verifiedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  method?: string | null;

  @ApiProperty({ example: 'verified' })
  badge!: string;
}
