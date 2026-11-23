export enum Role {
  USER = 'user',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  ADMIN = 'admin',
}

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  /** Wallet address (subject). */
  sub: string;
  roles: Role[];
  type: TokenType;
  /** Unique token id; used for refresh rotation and logout blacklisting. */
  jti: string;
  /** User token version; changing it invalidates every token issued at an older version. */
  ver?: number;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  address: string;
  roles: Role[];
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  nonceTtlSeconds: number;
  adminAddresses: string[];
  mentorAddresses: string[];
}

export const AUTH_CONFIG = 'AUTH_CONFIG';

const list = (value: string | undefined) =>
  (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function buildAuthConfig(read: (key: string) => string | undefined): AuthConfig {
  const secret = read('JWT_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set to a value of at least 16 characters');
  }
  const num = (key: string, fallback: number) => {
    const value = Number(read(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    jwtSecret: secret,
    accessTtlSeconds: num('JWT_ACCESS_TTL_SECONDS', 15 * 60),
    refreshTtlSeconds: num('JWT_REFRESH_TTL_SECONDS', 7 * 24 * 3600),
    nonceTtlSeconds: num('AUTH_NONCE_TTL_SECONDS', 300),
    adminAddresses: list(read('AUTH_ADMIN_ADDRESSES')),
    mentorAddresses: list(read('AUTH_MENTOR_ADDRESSES')),
  };
}
