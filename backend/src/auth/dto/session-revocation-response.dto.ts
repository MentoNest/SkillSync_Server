import { ApiProperty } from '@nestjs/swagger';

export class SessionRevocationResponseDto {
  @ApiProperty({ example: 'All active sessions have been revoked.' })
  message!: string;

  @ApiProperty({ description: 'Number of refresh tokens revoked.', example: 3 })
  revokedCount!: number;
}
