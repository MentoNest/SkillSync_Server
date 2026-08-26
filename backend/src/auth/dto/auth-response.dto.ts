import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../user/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT Access Token used for Bearer Authentication (expires in 15 minutes to 1 day)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJ0b2tlblZlcnNpb24iOjAsImlhdCI6MTY5Mjk2MDAwMCwiZXhwIjoxNjkyOTYwOTAwfQ.signature',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh Token used to generate new access tokens (long-lived, stored securely)',
    example: 'd8e4f1a2-7b3c-4d5e-9f0a-1b2c3d4e5f6a',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Type of token',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Access token expiration duration in seconds',
    example: 86400,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Authenticated user profile details',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;
}
