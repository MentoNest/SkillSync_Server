export interface JwtPayload {
  sub: string;
  walletAddress?: string;
  roles: string[];
  status?: string;
  tokenVersion: number;
  typ?: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}
