import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './providers/notification.service';
import { NotificationController } from './notification.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Notification } from './entities/notification.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Notification, User])],
  controllers: [NotificationController],
  providers: [NotificationService, RolesGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
