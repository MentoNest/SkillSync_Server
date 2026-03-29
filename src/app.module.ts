import { Module } from '@nestjs/common';
import { SkillModule } from './modules/skill/skill.module';
import { TagModule } from './modules/tag/tag.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { NotificationModule } from './modules/notification/notification.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AuditModule } from './modules/audit/audit.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { RedisModule } from './modules/redis/redis.module';
import { MailModule } from './modules/mail/mail.module';
import { PaginationModule } from './modules/pagination/pagination.module';
import { DatabaseModule } from './modules/database/database.module';
import { ConfigModule } from './config/config.module';
import { CacheModule } from './common/cache/cache.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { SkillsModule } from './modules/skills/skills.module';
import { ServiceListingModule } from './modules/service-listing/service-listing.module';
import { SendModule } from './modules/send/send.module';

@Module({
  imports: [
    SkillModule,
    TagModule,
    ConfigModule,
    DatabaseModule,
    CacheModule,
    CommonModule,
    HealthModule,
    UserModule,
    AuthModule,
    ProfileModule,
    NotificationModule,
    BookingsModule,
    AvailabilityModule,
    SkillsModule,
    ServiceListingModule,
    PaymentsModule,
    SendModule,
    AuditModule,
    ReviewsModule,
    RatingsModule,
    RedisModule,
    MailModule,
    PaginationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
