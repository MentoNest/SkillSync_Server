import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUrl,
} from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  mentorId!: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
