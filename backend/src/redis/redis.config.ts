/**
 * Redis configuration (#1422), sourced entirely from environment variables.
 *
 * A single `keyPrefix` namespaces every key this service touches so caching,
 * sessions, rate-limit counters, and token blacklists can share one Redis
 * instance (or separate `REDIS_DB` indices) without colliding.
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  /** Redis database index (0-15). Separate concerns can use separate DBs. */
  db: number;
  /** Prepended to every key — the cross-concern collision guard. */
  keyPrefix: string;
  /** Connection timeout in milliseconds (default 10 seconds). */
  connectTimeoutMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: intEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: intEnv('REDIS_DB', 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'skillsync:',
    connectTimeoutMs: intEnv('REDIS_CONNECT_TIMEOUT_MS', 10000),
  };
}
