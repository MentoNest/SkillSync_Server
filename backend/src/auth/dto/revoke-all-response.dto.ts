import { ApiProperty } from '@nestjs/swagger';

export class RevokeAllResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Detailed confirmation message',
    example: 'All active sessions have been successfully revoked',
  })
  message: string;

  @ApiProperty({
    description: 'Number of active sessions/tokens revoked',
    example: 4,
  })
  revokedSessionsCount: number;

  @ApiProperty({
    description: 'New token version for the user account',
    example: 2,
  })
  tokenVersion: number;
}
