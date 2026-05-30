import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number | null;
}
