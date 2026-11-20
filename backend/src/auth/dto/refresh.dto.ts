import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'The refresh token issued by POST /auth/login or a previous POST /auth/refresh. ' +
      'Each refresh token is single-use; a new pair is returned on success.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHRFFQMktQ...',
  })
  @IsJWT()
  refreshToken!: string;
}
