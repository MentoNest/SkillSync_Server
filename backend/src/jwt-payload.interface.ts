export interface JwtAccessTokenPayload {
  sub: string;
  wallet: string;
  roles: string[];
  permissions: string[];
  jti: string;
  ver: number;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}
