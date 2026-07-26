import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * #967: PostgreSQL connection configuration with TypeORM.
 *
 * Features:
 * - Environment variable configuration for all connection parameters
 * - Connection pooling (poolSize: 10-20)
 * - SSL support configurable per environment
 * - Slow query logging in development
 * - Retry logic handled at the module level
 */

const isProduction = process.env.NODE_ENV === 'production';

const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'skill_sync',

  // Auto-load all entity files
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],

  // Never auto-sync in production — use migrations
  synchronize: false,

  // Migration support
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  migrationsRun: isProduction,

  // Connection pooling: 10-20 connections
  poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),

  // SSL for production
  ssl: isProduction ? { rejectUnauthorized: false } : false,

  // Logging configuration
  logging: process.env.DB_LOGGING === 'true' || !isProduction,
  logger: 'advanced-console',

  // Slow query threshold (ms)
  maxQueryExecutionTime: parseInt(process.env.DB_SLOW_QUERY_MS || '1000', 10),

  // Connection timeout
  connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
};

export default typeOrmConfig;

/**
 * Retry configuration for database connections.
 * Used by the AppModule to attempt reconnection on failure.
 */
export const DB_RETRY_CONFIG = {
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '5', 10),
  retryDelayMs: parseInt(process.env.DB_RETRY_DELAY_MS || '2000', 10),
};
