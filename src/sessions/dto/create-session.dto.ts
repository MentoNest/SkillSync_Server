import { IsString, IsOptional, IsUUID, IsEnum, IsDateString } from 'class-validator';
import { SessionStatus } from '../session-status.enum';

export class CreateSessionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  hostId: string;

  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;  // Defaults to 'pending' in service logic
}
