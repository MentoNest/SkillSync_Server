import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleVerificationDto {
  @ApiProperty({ description: 'Verification status', example: true })
  @IsBoolean()
  isVerified: boolean;
}
