import { ApiProperty } from '@nestjs/swagger';

export class RevokeAllResponseDto {
  @ApiProperty({ example: 3, description: 'Number of refresh-token sessions revoked' })
  revokedSessions!: number;

  @ApiProperty({ example: 4, description: 'New token version; older access tokens are rejected' })
  tokenVersion!: number;
}
