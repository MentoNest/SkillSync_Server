import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SetDisplayNameDto {
  @ApiPropertyOptional({
    description:
      'Display name shown publicly on the profile. Up to 50 characters. ' +
      'Send null or omit the field to reset to the default (first 8 characters of the wallet address).',
    example: 'Alice the Developer',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string | null;
}
