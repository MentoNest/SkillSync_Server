import { ApiProperty } from '@nestjs/swagger';

export class TokenPairResponseDto {
  @ApiProperty({
    description:
      'Short-lived JWT for authenticating API requests. Send as "Authorization: Bearer <token>". ' +
      'Defaults to a 15-minute lifetime.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHRFFQMktQ...',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Long-lived JWT used exclusively to obtain a new token pair via POST /auth/refresh. ' +
      'Single-use; the previous refresh token is invalidated on each rotation. ' +
      'Defaults to a 7-day lifetime.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHRFFQMktQcmVm...',
  })
  refreshToken!: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  expiresIn!: number;
}
