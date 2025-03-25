import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { SessionStatus } from '../entities/sessions.entity';
import { CreateSessionDto } from './create-session.dto';


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
