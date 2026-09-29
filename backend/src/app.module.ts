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
import { HealthModule } from './health/health.module.js';
import { ThrottlerModule } from './guards/throttler.module.js';

import {
  GlobalExceptionFilter,
  LoggingInterceptor,
  TransformInterceptor,
} from './common/index.js';
import { PaginationModule } from './common/services/pagination.module.js';

import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { AuditModule } from './audit/audit.module.js';
import { LogoutModule } from './logout/logout.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { SecurityModule } from './security/security.module.js';
import { SeedModule } from './seed/seed.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { AdminModule } from './modules/admin.module.js';

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

    // ─── Rate Limiting ─────────────────────────────────────────────────────
    // Publishes ThrottlerGuard as a global guard so every route is throttled
    // by default, with per-route @Throttle() overrides where declared.
    ThrottlerModule,

    // ─── Identity & Access ─────────────────────────────────────────────────
    // SecurityModule is @Global: it owns the shared Redis connection and the
    // access token blacklist used by the JWT guard.
    SecurityModule,
    // #1320: audit trail (also provides the retention sweep on boot).
    AuditModule,
    // #1313-#1316: Stellar wallet login, JWT issuance, refresh rotation.
    AuthModule,
    UserModule,
    // #1317: POST /auth/logout and POST /auth/logout-all.
    LogoutModule,
    // #1318: roles catalogue + assignment API.
    RbacModule,

    // #1319: runs on application bootstrap, before the server starts listening.
    SeedModule,
    MetricsModule,
    PaginationModule,

    // #1346: admin dashboard, featured mentors management, public mentor listing.
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // Global exception filter — normalizes all HTTP errors
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },

    // Global logging interceptor — logs request method/url/duration
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },

    // Global response transformer — wraps successful responses consistently
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
