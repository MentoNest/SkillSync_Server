import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateDisplayNameDto {
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Display name must be at most 50 characters' })
  displayName?: string;
}
