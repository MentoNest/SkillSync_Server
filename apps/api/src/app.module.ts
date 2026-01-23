import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { ListingsModule } from './listings/listings.module';
import { MentorProfilesModule } from './mentor-profiles/mentor-profiles.module';
import { SkillsModule } from './skills/skills.module';
import { UsersModule } from './users/users.module';
import rateLimitConfig from './config/rate-limit.config'; // Import the rate limit config
import { BookingsModule } from './bookings/bookings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [rateLimitConfig], // Load the rate limit configuration
    }),
    DatabaseModule,
    HealthModule,
    UsersModule,
    MentorProfilesModule,
    SkillsModule,
    ListingsModule,
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
