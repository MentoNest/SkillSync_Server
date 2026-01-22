import { IsDateString, IsObject } from "class-validator";

export class CreateAvailabilityExceptionDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsObject()
  payload!: {
    type: 'FULL_DAY' | 'PARTIAL';
    startMinutes?: number;
    endMinutes?: number;
  };
}
