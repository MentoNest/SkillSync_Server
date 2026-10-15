import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * PostgreSQL connection settings (#1421), read from the environment.
 *
 * Exported both as a plain object (`getDatabaseConfig`) for the migration CLI
 * and as a `registerAs` namespace for `ConfigModule`, so the running app and
 * the CLI share one source of truth.
 */
export interface DatabaseRetryConfig {
  /** Maximum connection attempts before startup fails (default 5). */
  retryAttempts: number;
  /** Delay between attempts in milliseconds (default 3000). */
  retryDelay: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  return raw === 'true';
}

/** Plain connection settings built from `DB_*` environment variables. */
export function getDatabaseConfig(): TypeOrmModuleOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const sslEnabled = process.env.DB_SSL === 'true';

  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: intEnv('DB_PORT', 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'skillsync',

    // Entities are registered through `TypeOrmModule.forFeature` in each
    // feature module; `DatabaseModule` turns on `autoLoadEntities` so the
    // app picks them up from source without a hand-maintained glob.
    entities: [],
    autoLoadEntities: true,

    // Schema sync: explicit DB_SYNCHRONIZE wins, otherwise enabled outside
    // production so local development needs no manual migration step.
    synchronize: boolEnv('DB_SYNCHRONIZE') ?? !isProduction,

    migrations: ['src/database/migrations/*.ts'],
    migrationsRun: false,
    migrationsTableName: 'migrations_history',

    // Connection pool — default 10-20 connections (issue #1421).
    extra: {
      min: intEnv('DB_POOL_MIN', 10),
      max: intEnv('DB_POOL_MAX', 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    },

    // SSL: opt-in per environment; certificate validation defaults to on.
    ssl: sslEnabled
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : (false as const),

    // Query logging: verbose (incl. slow-query threshold) in development,
    // errors only in production.
    logging: isProduction ? (['error'] as const) : (['query', 'warn', 'error'] as const),
    maxQueryExecutionTime: intEnv('DB_SLOW_QUERY_MS', 1000),
  };
}

/** TypeORM connection retry settings (max 5 attempts by default). */
export function getDatabaseRetryConfig(): DatabaseRetryConfig {
  return {
    retryAttempts: intEnv('DB_MAX_RETRIES', 5),
    retryDelay: intEnv('DB_RETRY_DELAY_MS', 3000),
  };
}

/** `config.get('database')` namespace consumed by `DatabaseModule`. */
export const databaseConfig = registerAs('database', () => getDatabaseConfig());
