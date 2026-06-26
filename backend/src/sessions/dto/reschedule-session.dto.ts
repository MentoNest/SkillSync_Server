import { IsDateString } from 'class-validator';

export class RescheduleSessionDto {
  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;
}
