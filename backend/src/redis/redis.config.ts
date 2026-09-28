/**
 * Redis configuration (#1142), sourced entirely from environment variables.
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  connectTimeoutMs: number;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseIntEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    // Different Redis DB index per concern is supported by pointing
    // REDIS_DB at a different index per deployment/service if needed.
    db: parseIntEnv('REDIS_DB', 0),
    // Namespaces every key this service touches, so caching, sessions,
    // rate limiting, and token blacklisting can share one Redis instance
    // without colliding. Callers can layer their own sub-namespace on top,
    // e.g. `cache:user:123`, `ratelimit:login:1.2.3.4`.
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'skillsync:',
    connectTimeoutMs: parseIntEnv('REDIS_CONNECT_TIMEOUT_MS', 10000),
  };
}
