import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthGuardsModule } from './auth/guards/auth-guards.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SecurityModule } from './auth/security/security.module';
import { AvailabilityModule } from './availability/availability.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeModule } from './common/interceptors/response-envelope.module';
import { PaginationModule } from './common/pagination/pagination.module';
import { createAppValidationPipe } from './common/pipes/app-validation.pipe';
import { TimezoneModule } from './common/timezone/timezone.module';
import { MentorVerificationModule } from './mentor-verification/mentor-verification.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { AvatarModule } from './users/avatar/avatar.module';
import { FeaturedMentorModule } from './users/mentor-profile/featured-mentor.module';
import { HealthModule } from './health/health.module';
import { DemoSeedModule } from './seed/demo-seed.module';
import { PortfolioLinksModule } from './users/portfolio-links/portfolio-links.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    AuditModule,
    AuthGuardsModule,
    RateLimitModule,
    SecurityModule,
    AvailabilityModule,
    TimezoneModule,
    MentorVerificationModule,
    RbacModule,
    AvatarModule,
    PortfolioLinksModule,
    FeaturedMentorModule,
    HealthModule,
    DemoSeedModule,
    // Standardised pagination (#1461) and the success/error envelope (#1462).
    PaginationModule,
    ResponseEnvelopeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useValue: createAppValidationPipe() },
  ],
})
export class AppModule {}