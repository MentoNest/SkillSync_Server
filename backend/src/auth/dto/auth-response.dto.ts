import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../user/dto/user-response.dto.js';

export class AuthResponseDto {
  @ApiProperty({
    description:
      'JWT Access Token (HS256 or RS256, lifetime from JWT_ACCESS_EXPIRATION, default 15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTY5Mjk2MDAwMCwiZXhwIjoxNjkyOTYwOTAwfQ.signature',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Refresh Token used to obtain a new access token pair. It is rotated on every use and carries the same core claims as the access token.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIn0.signature',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Type of token',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Access token expiration duration in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh token expiration duration in seconds (default 30 days)',
    example: 2592000,
  })
  refreshExpiresIn: number;

  @ApiProperty({
    description: 'Authenticated user profile details',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;
}
