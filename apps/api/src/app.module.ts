import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { ListingsModule } from './listings/listings.module';
import { MentorProfilesModule } from './mentor-profiles/mentor-profiles.module';
import { SkillsModule } from './skills/skills.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
<<<<<<< HEAD
import { SessionsModule } from './sessions/sessions.module';
=======
import { AuthModule } from './auth/auth.module';
import { VerifyModule } from './verify/verify.module';
import rateLimitConfig from './config/rate-limit.config'; // Import the rate limit config
>>>>>>> upstream/main
import { BookingsModule } from './bookings/bookings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [rateLimitConfig], // Load the rate limit configuration
    }),
    DatabaseModule,
      RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    MentorProfilesModule,
    SkillsModule,
    ListingsModule,
<<<<<<< HEAD
    SessionsModule,
=======
    VerifyModule,
>>>>>>> upstream/main
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
