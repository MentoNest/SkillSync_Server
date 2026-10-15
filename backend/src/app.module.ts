import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { appConfig, envValidationSchema, featureFlagsConfig } from './config/index.js';

/**
 * Root application module (#1420).
 *
 * Configuration is loaded once, globally, with Joi validation — the app fails
 * at startup rather than on first use when a variable is missing. Feature
 * flags live in their own namespace so gradual rollouts are per-environment.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      load: [appConfig, featureFlagsConfig],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
