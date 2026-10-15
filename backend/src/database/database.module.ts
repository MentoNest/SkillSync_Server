import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { getDatabaseRetryConfig } from '../config/database.config.js';

/**
 * Resilient PostgreSQL connection module (#1421).
 *
 * - Connection options come from the validated `database` config namespace.
 * - TypeORM's built-in retry (`retryAttempts`/`retryDelay`, default 5 × 3s)
 *   re-establishes the connection if the database restarts.
 * - `autoLoadEntities` collects every `TypeOrmModule.forFeature` registration
 *   from the feature modules, so entities are picked up from
 *   `src/**/*.entity.ts` without a hand-maintained list.
 * - The pool size is published to the logger at startup so operators can
 *   confirm the configured 10-20 connection pool without inspecting env vars.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const logger = new Logger('DatabaseModule');
        const dbConfig = configService.get<TypeOrmModuleOptions>('database');
        if (!dbConfig) {
          throw new Error('Database configuration is missing (namespace "database")');
        }

        const retry = getDatabaseRetryConfig();
        const pool = dbConfig.extra as { min?: number; max?: number } | undefined;

        logger.log(
          `PostgreSQL ${dbConfig.host}:${String(dbConfig.port)}/${String(dbConfig.database)} — ` +
            `pool ${String(pool?.min)}-${String(pool?.max)}, ` +
            `retry ${retry.retryAttempts}×${retry.retryDelay}ms`,
        );

        return {
          ...dbConfig,
          autoLoadEntities: true,
          retryAttempts: retry.retryAttempts,
          retryDelay: retry.retryDelay,
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
