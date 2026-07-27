/**
 * Auth response DTOs (Swagger decorators removed — @nestjs/swagger not installed).
 */

export class NonceResponseDto {
  nonce: string;
  expiresAt: number;
}

export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
