import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

/**
 * PostgreSQL / TypeORM configuration (#1141).
 *
 * Centralizes everything the app needs to talk to Postgres so the same
 * settings are used both by the running Nest app (`AppModule`) and by the
 * TypeORM CLI (`src/data-source.ts`, used for `migration:generate/run/revert`).
 *
 * All values are sourced from environment variables so connection details
 * never need to be hard-coded per environment.
 */

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true';
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Base Postgres connection options shared by the Nest app and the TypeORM CLI.
 */
export function getDatabaseConfig(): DataSourceOptions {
  const production = isProductionEnv();
  const sslEnabled = parseBoolEnv('DB_SSL', false);

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseIntEnv('DB_PORT', 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'skillsync',

    // Auto-load every *.entity.ts (or compiled *.entity.js) file anywhere
    // under src/, regardless of which folder it lives in.
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],

    // Dedicated, versioned migrations directory (generate/run/revert via CLI).
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',

    // Schema changes should go through migrations outside local development.
    // DB_SYNCHRONIZE can force either behaviour explicitly if ever needed.
    synchronize: process.env.DB_SYNCHRONIZE
      ? parseBoolEnv('DB_SYNCHRONIZE', false)
      : !production,

    // SSL support, configurable per environment (e.g. required by most
    // managed Postgres providers such as RDS/Supabase/Render in production).
    ssl: sslEnabled
      ? { rejectUnauthorized: parseBoolEnv('DB_SSL_REJECT_UNAUTHORIZED', true) }
      : false,

    // Connection pooling – default pool size 10-20 (issue #1141).
    extra: {
      max: parseIntEnv('DB_POOL_MAX', 20),
      min: parseIntEnv('DB_POOL_MIN', 10),
      idleTimeoutMillis: parseIntEnv('DB_POOL_IDLE_TIMEOUT_MS', 30000),
      connectionTimeoutMillis: parseIntEnv('DB_CONNECT_TIMEOUT_MS', 10000),
    },

    // Slow query logging: full query logging in development, errors only in
    // production. `maxQueryExecutionTime` makes TypeORM warn about any query
    // (in any environment) that runs longer than the configured threshold.
    logging: production ? ['error'] : ['query', 'error', 'warn'],
    maxQueryExecutionTime: parseIntEnv('DB_SLOW_QUERY_MS', 1000),
  };
}

/**
 * Retry configuration consumed by `TypeOrmModule.forRootAsync`. Nest retries
 * the initial connection this many times (waiting `retryDelay` ms between
 * attempts) before giving up and failing application startup.
 */
export function getDatabaseRetryConfig() {
  return {
    retryAttempts: parseIntEnv('DB_MAX_RETRIES', 5),
    retryDelay: parseIntEnv('DB_RETRY_DELAY_MS', 3000),
  };
}
