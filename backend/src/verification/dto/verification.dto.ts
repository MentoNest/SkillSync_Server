import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { VerificationMethod } from '../entities/verification-badge.entity.js';

/** User-initiated: mentor requests verification. */
export class RequestVerificationDto {
  @IsEnum(VerificationMethod)
  verificationMethod: VerificationMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Admin-initiated: grant or update a verification badge. */
export class VerifyMentorDto {
  @IsEnum(VerificationMethod)
  verificationMethod: VerificationMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Admin-initiated: revoke a verification badge. */
export class RevokeVerificationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
