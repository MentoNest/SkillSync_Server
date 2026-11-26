import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';

/** Reads one environment variable; `process.env[key]` or a ConfigService adapter. */
export type EnvReader = (key: string) => string | undefined;

export const DEFAULT_POOL_SIZE = 20;
export const MIN_POOL_SIZE = 10;
export const MAX_POOL_SIZE = 20;
export const DEFAULT_RETRY_ATTEMPTS = 5;
export const DEFAULT_RETRY_DELAY_MS = 3000;
export const DEFAULT_SLOW_QUERY_MS = 200;

function readInt(read: EnvReader, key: string, fallback: number): number {
  const raw = read(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

function readBool(read: EnvReader, key: string, fallback: boolean): boolean {
  const raw = read(key)?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export interface DatabaseSettings {
  options: DataSourceOptions;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Builds the PostgreSQL connection settings from environment variables.
 *
 * - `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` (the password and database
 *   name are required outside development)
 * - `DB_SSL` (`true` to enable), `DB_SSL_REJECT_UNAUTHORIZED` (default true), `DB_SSL_CA`
 * - `DB_POOL_SIZE` (default 20, clamped to 10-20)
 * - `DB_RETRY_ATTEMPTS` (default 5) and `DB_RETRY_DELAY_MS` (default 3000)
 * - `DB_MIGRATIONS_RUN` (default false), `DB_SLOW_QUERY_MS` (development only, default 200)
 *
 * Entities are loaded from every `*.entity.ts` (or compiled `.js`) file under `src`,
 * migrations from `src/database/migrations`.
 */
export function buildDatabaseSettings(read: EnvReader): DatabaseSettings {
  const nodeEnv = read('NODE_ENV') ?? 'development';
  const isDevelopment = nodeEnv === 'development';

  const password = read('DB_PASSWORD');
  const database = read('DB_NAME');
  if (!isDevelopment) {
    const missing = [!password && 'DB_PASSWORD', !database && 'DB_NAME'].filter(
      Boolean,
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required database environment variable(s): ${missing.join(', ')}`,
      );
    }
  }

  const sslEnabled = readBool(read, 'DB_SSL', false);
  const ca = read('DB_SSL_CA');
  const poolSize = Math.min(
    MAX_POOL_SIZE,
    Math.max(MIN_POOL_SIZE, readInt(read, 'DB_POOL_SIZE', DEFAULT_POOL_SIZE)),
  );

  const options: DataSourceOptions = {
    type: 'postgres',
    host: read('DB_HOST') ?? 'localhost',
    port: readInt(read, 'DB_PORT', 5432),
    username: read('DB_USERNAME') ?? 'postgres',
    password: password ?? 'postgres',
    database: database ?? 'skillsync',
    ssl: sslEnabled
      ? {
          rejectUnauthorized: readBool(
            read,
            'DB_SSL_REJECT_UNAUTHORIZED',
            true,
          ),
          ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}),
        }
      : false,
    // Works for ts-node (src/**/*.entity.ts) and for the compiled app (dist/**/*.entity.js).
    entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'migrations',
    migrationsRun: readBool(read, 'DB_MIGRATIONS_RUN', false),
    synchronize: false,
    poolSize,
    extra: {
      connectionTimeoutMillis: readInt(
        read,
        'DB_CONNECTION_TIMEOUT_MS',
        10_000,
      ),
      idleTimeoutMillis: readInt(read, 'DB_IDLE_TIMEOUT_MS', 30_000),
    },
    logging: isDevelopment ? ['error', 'warn', 'migration'] : ['error'],
    // Slow query logging (a warning for queries slower than this) is for development.
    ...(isDevelopment
      ? {
          maxQueryExecutionTime: readInt(
            read,
            'DB_SLOW_QUERY_MS',
            DEFAULT_SLOW_QUERY_MS,
          ),
        }
      : {}),
  };

  return {
    options,
    retryAttempts: readInt(read, 'DB_RETRY_ATTEMPTS', DEFAULT_RETRY_ATTEMPTS),
    retryDelay: readInt(read, 'DB_RETRY_DELAY_MS', DEFAULT_RETRY_DELAY_MS),
  };
}
