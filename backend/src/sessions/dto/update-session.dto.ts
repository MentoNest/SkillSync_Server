import { IsOptional, IsEnum, IsNumber, IsString, Min, Max } from 'class-validator';
import { SessionStatus } from '../entities/enums/session-status.enum.js';

export class UpdateSessionDto {
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  review?: string;

  @IsOptional()
  meetingUrl?: string;

  @IsOptional()
  notes?: string;
}
