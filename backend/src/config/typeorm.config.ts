import { TypeOrmModuleOptions } from '@nestjs/typeorm';

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

  // Connection pooling
  poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),

  // SSL for production
  ssl: isProduction ? { rejectUnauthorized: false } : false,

  // Logging
  logging: process.env.DB_LOGGING === 'true' || !isProduction,
  logger: 'advanced-console',

  // Slow query threshold (ms)
  maxQueryExecutionTime: parseInt(process.env.DB_SLOW_QUERY_MS || '1000', 10),

  // Connection timeout (postgres driver option)
  connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
};

export default typeOrmConfig;

export const DB_RETRY_CONFIG = {
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '5', 10),
  retryDelayMs: parseInt(process.env.DB_RETRY_DELAY_MS || '2000', 10),
};
