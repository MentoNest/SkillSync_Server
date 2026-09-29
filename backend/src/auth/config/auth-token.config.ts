/**
 * #1313, #1315, #1316: environment driven authentication settings.
 *
 * Everything is resolved once, at first use, and exposed as frozen objects so a
 * misconfigured value fails loudly in one place instead of silently changing
 * token lifetimes halfway through a request.
 *
 * Recognised variables (all optional, defaults shown):
 *
 * | Variable                     | Default   | Meaning                                    |
 * |------------------------------|-----------|--------------------------------------------|
 * | `JWT_SECRET`                 | –         | HS256 signing secret (required for HS256)  |
 * | `JWT_ALGORITHM`              | `HS256`   | `HS256` or `RS256`                         |
 * | `JWT_PRIVATE_KEY`            | –         | PEM RSA private key (required for RS256)   |
 * | `JWT_PUBLIC_KEY`             | derived   | PEM RSA public key, derived from private   |
 * | `JWT_ISSUER`                 | `skillsync` | `iss` claim                               |
 * | `JWT_AUDIENCE`               | `skillsync-api` | `aud` claim                           |
 * | `JWT_ACCESS_EXPIRATION`      | `15m`     | Access token lifetime (15-60m recommended) |
 * | `JWT_REFRESH_EXPIRATION_DAYS`| `30`      | Refresh token lifetime (7-30 days)          |
 * | `NONCE_TTL_SECONDS`          | `300`     | Wallet challenge lifetime                  |
 * | `NONCE_RATE_LIMIT_MAX`       | `5`       | Nonce requests per minute per wallet       |
 * | `WALLET_LOGIN_RATE_LIMIT_MAX`| `10`      | Login attempts per window per wallet       |
 * | `WALLET_LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `900` | Login attempt window (15m)      |
 * | `REFRESH_REUSE_ALERT`        | `true`    | Alert + family revoke on token reuse       |
 */
import type { SignOptions } from 'jsonwebtoken';
import { getJwtSecret } from '../../config/production-security.config.js';

export type JwtAlgorithm = 'HS256' | 'RS256';

export interface AuthTokenConfig {
  algorithm: JwtAlgorithm;
  secret: string;
  privateKey: string;
  publicKey: string;
  issuer: string;
  audience: string;
  /** Access token lifetime, e.g. `15m`. */
  accessExpiration: string;
  /** Access token lifetime in seconds, derived from {@link accessExpiration}. */
  accessExpiresIn: number;
  /** Refresh token lifetime in days. */
  refreshExpirationDays: number;
  refreshExpiresIn: number;
  nonceTtlSeconds: number;
  nonceRateLimitMax: number;
  walletLoginRateLimitMax: number;
  walletLoginRateLimitWindowSeconds: number;
  refreshReuseAlert: boolean;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Parses a `ms`-style duration (`900`, `15m`, `1h`, `7d`, `900s`) into seconds.
 * Returns `undefined` for anything unparsable so the caller can apply its own
 * default instead of silently issuing a token that never expires.
 */
export function parseDurationToSeconds(
  value: string | undefined,
  fallbackSeconds: number,
): number {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallbackSeconds;
  }

  const raw = String(value).trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/.exec(raw);
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case undefined:
      return Math.floor(amount);
    case 'ms':
      return Math.max(1, Math.floor(amount / 1000));
    case 's':
      return Math.floor(amount);
    case 'm':
      return Math.floor(amount * MINUTE);
    case 'h':
      return Math.floor(amount * HOUR);
    case 'd':
      return Math.floor(amount * DAY);
    default:
      return fallbackSeconds;
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || String(value).trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readInteger(
  value: string | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

let cached: AuthTokenConfig | null = null;

/** Builds (and caches) the configuration from the current environment. */
export function loadAuthTokenConfig(): AuthTokenConfig {
  const env = process.env;

  const algorithm: JwtAlgorithm =
    String(env.JWT_ALGORITHM || 'HS256').toUpperCase() === 'RS256' ? 'RS256' : 'HS256';

  const privateKey = (env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const publicKey = (env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');

  const accessExpiresIn = parseDurationToSeconds(env.JWT_ACCESS_EXPIRATION, 15 * MINUTE);
  const refreshExpirationDays = readInteger(env.JWT_REFRESH_EXPIRATION_DAYS, 30, {
    min: 1,
    max: 365,
  });

  cached = Object.freeze({
    algorithm,
    secret: env.JWT_SECRET || getJwtSecret(),
    privateKey,
    publicKey,
    issuer: env.JWT_ISSUER || 'skillsync',
    audience: env.JWT_AUDIENCE || 'skillsync-api',
    accessExpiration: env.JWT_ACCESS_EXPIRATION || '15m',
    accessExpiresIn,
    refreshExpirationDays,
    refreshExpiresIn: refreshExpirationDays * DAY,
    nonceTtlSeconds: readInteger(env.NONCE_TTL_SECONDS, 300, { min: 30, max: 3600 }),
    nonceRateLimitMax: readInteger(env.NONCE_RATE_LIMIT_MAX, 5, { min: 1, max: 100 }),
    walletLoginRateLimitMax: readInteger(env.WALLET_LOGIN_RATE_LIMIT_MAX, 10, {
      min: 1,
      max: 1000,
    }),
    walletLoginRateLimitWindowSeconds: readInteger(
      env.WALLET_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
      15 * MINUTE,
      { min: 10, max: DAY },
    ),
    refreshReuseAlert: readBoolean(env.REFRESH_REUSE_ALERT, true),
  });

  return cached;
}

/** Cached accessor; the environment is read once per process. */
export function getAuthTokenConfig(): AuthTokenConfig {
  return cached ?? loadAuthTokenConfig();
}

/** Test hook: forget the cached configuration. */
export function resetAuthTokenConfig(): void {
  cached = null;
}

/** Sign options shared by access and refresh tokens. */
export function signOptionsFor(
  config: AuthTokenConfig,
  expiresIn: string | number,
): SignOptions & { secret?: string; privateKey?: string } {
  const options: SignOptions & { secret?: string; privateKey?: string } = {
    algorithm: config.algorithm,
    expiresIn: expiresIn as SignOptions['expiresIn'],
    issuer: config.issuer,
    audience: config.audience,
  };

  // @nestjs/jwt reads the signing material from `secret`/`privateKey`.
  if (config.algorithm === 'RS256') {
    options.privateKey = config.privateKey;
  } else {
    options.secret = config.secret;
  }

  return options;
}

/** Verification options shared by access and refresh token validation. */
export function verifyOptionsFor(config: AuthTokenConfig): {
  algorithms: JwtAlgorithm[];
  issuer: string;
  audience: string;
  secret?: string;
  publicKey?: string;
} {
  return {
    algorithms: [config.algorithm],
    issuer: config.issuer,
    audience: config.audience,
    ...(config.algorithm === 'RS256'
      ? { publicKey: config.publicKey || config.privateKey }
      : { secret: config.secret }),
  };
}

/**
 * Throws when the selected algorithm cannot be used. RS256 without a private
 * key is a deployment error, not something to paper over with HS256.
 */
export function assertSigningMaterial(config: AuthTokenConfig): void {
  if (config.algorithm === 'RS256' && !config.privateKey) {
    throw new Error(
      'JWT_ALGORITHM=RS256 requires JWT_PRIVATE_KEY (PEM encoded RSA private key)',
    );
  }

  if (config.algorithm === 'HS256' && !config.secret) {
    throw new Error('JWT_ALGORITHM=HS256 requires JWT_SECRET');
  }
}
