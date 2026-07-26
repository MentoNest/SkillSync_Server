import { IsString, IsNotEmpty } from 'class-validator';

/**
 * #975: DTO for refreshing an access token using a refresh token.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
