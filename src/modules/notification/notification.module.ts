import { Module } from '@nestjs/common';
import { NotificationService } from './providers/notification.service';
import { NotificationController } from './notification.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, RolesGuard],
})
export class NotificationModule {}
