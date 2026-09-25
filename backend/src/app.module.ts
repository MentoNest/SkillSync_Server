import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import {
  appConfig,
  databaseConfig,
  featureFlagsConfig,
  envValidationSchema,
} from './config/index.js';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';

import {
  HttpExceptionFilter,
  LoggingInterceptor,
  TransformInterceptor,
} from './common/index.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true, // Available in every module without re-importing
      envFilePath: ['.env', `.env.${process.env.NODE_ENV ?? 'development'}`],
      load: [appConfig, databaseConfig, featureFlagsConfig],
      validationSchema: envValidationSchema,
      validationOptions: {},
    }),

    // ─── Observability ─────────────────────────────────────────────────────
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'skillsync-backend',
    }),

    // ─── Database ──────────────────────────────────────────────────────────
    DatabaseModule,

    // ─── Feature Modules ───────────────────────────────────────────────────
    HealthModule,
    // Add further feature modules here, e.g.:
    // UsersModule,
    // AuthModule,
    // SkillsModule,
    // EscrowModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // Global exception filter — catches all HTTP exceptions
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // Global logging interceptor — logs request method/url/duration
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },

    // Global response transformer — wraps all responses in { data, timestamp }
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
