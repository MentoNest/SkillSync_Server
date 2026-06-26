import { IsOptional, IsString } from 'class-validator';

export class CancelSessionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
