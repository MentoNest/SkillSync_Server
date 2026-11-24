import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { User } from '../user/user.entity';
import { NotificationController } from './notification.controller';
import { NotificationAdminController } from './notification-admin.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationPreference } from './notification-preference.entity';
import { Notification } from './notification.entity';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference, User]),
    JwtModule.register({}),
    AuthModule,
    RedisModule,
  ],
  controllers: [NotificationController, NotificationAdminController],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
