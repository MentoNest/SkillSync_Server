import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'Refresh token issued together with the access token being revoked. When omitted every active refresh token of the current session is revoked.',
    example: 'd8e4f1a2-7b3c-4d5e-9f0a-1b2c3d4e5f6a',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Logged out successfully' })
  message: string;

  @ApiProperty({
    description: 'Seconds the revoked access token stays blacklisted (its remaining lifetime)',
    example: 812,
  })
  blacklistedForSeconds: number | null;

  @ApiProperty({ description: 'Whether a refresh token row was deleted', example: true })
  refreshTokenRevoked: boolean;
}

export class LogoutAllResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'All sessions have been terminated' })
  message: string;

  @ApiProperty({ description: 'Number of revoked sessions', example: 3 })
  revokedSessionsCount: number;

  @ApiProperty({ description: 'New token version, invalidating all issued access tokens', example: 2 })
  tokenVersion: number;
}
