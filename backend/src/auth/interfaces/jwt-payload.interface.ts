export interface JwtAccessTokenPayload {
  sub: string;
  wallet: string;
  jti: string;
  iat: number;
  exp: number;
  roles?: string[];
}
