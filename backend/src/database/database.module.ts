import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { MetricsService } from '../metrics/metrics.service.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { MetricsTypeOrmLogger } from './metrics-typeorm.logger.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Provides a resilient TypeORM connection with retry logic.
 * Attempts to connect up to MAX_RETRIES times before failing startup.
 */
@Module({
  imports: [
    MetricsModule,
    TypeOrmModule.forRootAsync({
      useFactory: async (
        configService: ConfigService,
        metricsService: MetricsService,
      ): Promise<TypeOrmModuleOptions> => {
        const logger = new Logger('DatabaseModule');
        const dbConfig =
          configService.get<TypeOrmModuleOptions>('database') ?? {};

        let retries = 0;

        while (retries < MAX_RETRIES) {
          try {
            logger.log(
              `Attempting database connection (attempt ${retries + 1}/${MAX_RETRIES})`,
            );
            const poolSize = Number(dbConfig.extra?.max ?? 10);
            metricsService.setDbConnectionPoolSize(poolSize);
            // Return config — TypeORM will handle actual connection
            return {
              ...dbConfig,
              logger: new MetricsTypeOrmLogger(
                metricsService,
                dbConfig.logging,
                1000,
              ),
              // TypeORM calls logQuerySlow after each query; the logger records durations
              // but only emits warning logs for queries over the existing 1s threshold.
              maxQueryExecutionTime: 0.0001,
              // Retry connection via connectTimeoutMS and retryAttempts
              retryAttempts: MAX_RETRIES,
              retryDelay: RETRY_DELAY_MS,
              autoLoadEntities: true,
            };
          } catch (error) {
            retries++;
            if (retries >= MAX_RETRIES) {
              logger.error(
                `Failed to connect to database after ${MAX_RETRIES} attempts`,
                error,
              );
              throw error;
            }
            logger.warn(
              `Database connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s... (${retries}/${MAX_RETRIES})`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

        // Fallback (unreachable but satisfies TypeScript)
        return dbConfig as TypeOrmModuleOptions;
      },
      inject: [ConfigService, MetricsService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
