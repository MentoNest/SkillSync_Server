import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { appConfig, databaseConfig, envValidationSchema, featureFlagsConfig } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * Root application module (#1420, #1421, #1422).
 *
 * Configuration is loaded once, globally, with Joi validation — the app fails
 * at startup rather than on first use when a variable is missing. Feature
 * flags live in their own namespace so gradual rollouts are per-environment.
 * `DatabaseModule` establishes the retrying PostgreSQL connection before the
 * HTTP server starts accepting requests, `RedisModule` provides the shared
 * cache/session connection, and `HealthModule` exposes `GET /health`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      load: [appConfig, databaseConfig, featureFlagsConfig],
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
