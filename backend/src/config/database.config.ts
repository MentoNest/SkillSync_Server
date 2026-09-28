import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/** TypeORM database configuration factory */
export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'skillsync',

    // Auto-load all entity files across the project
    entities: ['dist/**/*.entity.js'],
    // In dev we auto-sync, in production use migrations only
    synchronize: process.env.NODE_ENV === 'development',

    // Migration configuration
    migrations: ['dist/database/migrations/*.js'],
    migrationsRun: false,
    migrationsTableName: 'migrations_history',

    // Connection pool
    extra: {
      max: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },

    // SSL — enabled in production
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,

    // Log slow queries only in development
    logging:
      process.env.NODE_ENV === 'development'
        ? (['query', 'warn', 'error'] as const)
        : (['error'] as const),
    maxQueryExecutionTime: 1000, // Log queries taking longer than 1s
  }),
);
