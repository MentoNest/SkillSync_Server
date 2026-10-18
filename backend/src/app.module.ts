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
import { TimezoneModule } from './common/timezone/timezone.module';
import { MentorVerificationModule } from './mentor-verification/mentor-verification.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { CompletenessModule } from './users/completeness/profile-completeness.module';
import { SuspensionModule } from './users/suspension/suspension.module';
import { UserStatusModule } from './users/user-status/user-status.module';
import { UsernameModule } from './users/username/username.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    AuditModule,
    AuthGuardsModule,
    RateLimitModule,
    SecurityModule,
    TimezoneModule,
    AvailabilityModule,
    MentorVerificationModule,
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
