import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDisplayNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName: string | null;
}
