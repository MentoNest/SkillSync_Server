import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsTimezone } from '../is-timezone.validator';

export class UpdateTimezoneDto {
  @ApiProperty({ example: 'America/New_York', description: 'IANA timezone name' })
  @IsString()
  @IsTimezone()
  timezone!: string;
}
