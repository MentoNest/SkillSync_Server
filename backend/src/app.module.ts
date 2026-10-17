import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuardsModule } from './auth/guards/auth-guards.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SecurityModule } from './auth/security/security.module';
import { AvailabilityModule } from './availability/availability.module';
import { TimezoneModule } from './common/timezone/timezone.module';
import { MentorVerificationModule } from './mentor-verification/mentor-verification.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    AuthGuardsModule,
    RateLimitModule,
    SecurityModule,
    TimezoneModule,
    AvailabilityModule,
    MentorVerificationModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
