import { IsInt, IsString, Max, Min } from 'class-validator';

export class CreateAvailabilitySlotDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsInt()
  @Min(0)
  startMinutes!: number;

  @IsInt()
  @Min(1)
  endMinutes!: number;

  @IsString()
  timezone!: string;
}
