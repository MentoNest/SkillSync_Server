/**
 * Production-safe environment validation (#1469).
 * Fails fast at startup when required secrets are missing.
 */

export interface AppEnv {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  DATABASE_URL?: string;
  REDIS_URL: string;
  CORS_ORIGINS: string;
  METRICS_BASIC_AUTH_USER?: string;
  METRICS_BASIC_AUTH_PASS?: string;
  METRICS_ALLOWED_IPS?: string;
  TRUST_PROXY?: string;
  COOKIE_SECURE?: string;
  RATE_LIMIT_AUTH_LIMIT?: string;
  RATE_LIMIT_ANON_LIMIT?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
}

const REQUIRED_IN_PROD = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL', 'CORS_ORIGINS'] as const;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const nodeEnv = String(config.NODE_ENV ?? process.env.NODE_ENV ?? 'development');
  const isProd = nodeEnv === 'production';

  if (isProd) {
    for (const key of REQUIRED_IN_PROD) {
      const value = config[key] ?? process.env[key];
      if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`Missing required environment variable in production: ${key}`);
      }
    }
    const jwt = String(config.JWT_SECRET ?? process.env.JWT_SECRET ?? '');
    if (jwt.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: Number(config.PORT ?? process.env.PORT ?? 3000),
    JWT_SECRET: String(config.JWT_SECRET ?? process.env.JWT_SECRET ?? 'dev-only-change-me'),
    DATABASE_URL: (config.DATABASE_URL ?? process.env.DATABASE_URL) as string | undefined,
    REDIS_URL: String(config.REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379'),
    CORS_ORIGINS: String(config.CORS_ORIGINS ?? process.env.CORS_ORIGINS ?? 'http://localhost:3000'),
    METRICS_BASIC_AUTH_USER: (config.METRICS_BASIC_AUTH_USER ?? process.env.METRICS_BASIC_AUTH_USER) as
      | string
      | undefined,
    METRICS_BASIC_AUTH_PASS: (config.METRICS_BASIC_AUTH_PASS ?? process.env.METRICS_BASIC_AUTH_PASS) as
      | string
      | undefined,
    METRICS_ALLOWED_IPS: (config.METRICS_ALLOWED_IPS ?? process.env.METRICS_ALLOWED_IPS) as
      | string
      | undefined,
    TRUST_PROXY: (config.TRUST_PROXY ?? process.env.TRUST_PROXY) as string | undefined,
    COOKIE_SECURE: (config.COOKIE_SECURE ?? process.env.COOKIE_SECURE) as string | undefined,
    RATE_LIMIT_AUTH_LIMIT: (config.RATE_LIMIT_AUTH_LIMIT ?? process.env.RATE_LIMIT_AUTH_LIMIT) as
      | string
      | undefined,
    RATE_LIMIT_ANON_LIMIT: (config.RATE_LIMIT_ANON_LIMIT ?? process.env.RATE_LIMIT_ANON_LIMIT) as
      | string
      | undefined,
    RATE_LIMIT_WINDOW_SECONDS: (config.RATE_LIMIT_WINDOW_SECONDS ??
      process.env.RATE_LIMIT_WINDOW_SECONDS) as string | undefined,
  };
}
