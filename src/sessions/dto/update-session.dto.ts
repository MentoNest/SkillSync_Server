import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { Session } from '../entities/sessions.entity';
import { CreateSessionDto } from './create-session.dto';
import { SessionStatus } from '../enums/session-status.enum';


export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus; // Allows only valid status updates
}
