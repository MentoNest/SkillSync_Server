import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  refreshToken: string;

  @ApiProperty({
    description: 'Device fingerprint (optional)',
    example: 'device-123-fingerprint',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @ApiProperty({
    description: 'User agent (optional)',
    example: 'Mozilla/5.0...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
