export type EnvReader = (key: string) => string | undefined;

/** Key prefix families: each concern gets its own namespace so keys cannot collide. */
export enum RedisNamespace {
  CACHE = 'cache',
  SESSION = 'session',
  RATE_LIMIT = 'ratelimit',
  BLACKLIST = 'blacklist',
  QUEUE = 'queue',
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_KEY_PREFIX = 'skillsync:';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  connectTimeout: number;
  keyPrefix: string;
}

function readInt(read: EnvReader, key: string, fallback: number): number {
  const raw = read(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

/**
 * Reads the Redis connection settings: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`,
 * `REDIS_DB` (database index), `REDIS_CONNECT_TIMEOUT_MS` (default 10 seconds) and
 * `REDIS_KEY_PREFIX` (default `skillsync:`).
 */
export function buildRedisConfig(read: EnvReader): RedisConfig {
  return {
    host: read('REDIS_HOST') ?? 'localhost',
    port: readInt(read, 'REDIS_PORT', 6379),
    password: read('REDIS_PASSWORD') || undefined,
    db: readInt(read, 'REDIS_DB', 0),
    connectTimeout: readInt(read, 'REDIS_CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS),
    keyPrefix: read('REDIS_KEY_PREFIX') ?? DEFAULT_KEY_PREFIX,
  };
}

/** Delay before reconnect attempt `times`: grows by 200 ms per attempt, capped at 5 seconds. */
export function reconnectDelay(times: number): number {
  return Math.min(times * 200, 5_000);
}

/** `<prefix><namespace>:<key>`, e.g. `skillsync:session:abc`. */
export function buildKey(prefix: string, namespace: RedisNamespace, key: string): string {
  return `${prefix}${namespace}:${key}`;
}
