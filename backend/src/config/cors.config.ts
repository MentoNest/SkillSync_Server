import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { ConfigService } from '@nestjs/config';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Parse `CORS_ORIGINS` (comma-separated) and merge with localhost defaults in
 * non-production environments (#1471).
 */
export function resolveAllowedOrigins(
  corsOriginsEnv: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const fromEnv = (corsOriginsEnv ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (nodeEnv === 'production') {
    return fromEnv;
  }

  const set = new Set([...fromEnv, ...DEFAULT_DEV_ORIGINS]);
  return [...set];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  // Non-browser clients (curl, server-to-server) send no Origin.
  if (!origin) return true;
  return allowed.includes(origin);
}

export function buildCorsOptions(config: ConfigService): CorsOptions {
  const allowed = resolveAllowedOrigins(
    config.get<string>('CORS_ORIGINS'),
    config.get<string>('NODE_ENV'),
  );

  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, allowed)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  };
}
