import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProfileHistorySubscriber } from './profile-history.subscriber';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, ProfileHistory]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService, ProfileHistorySubscriber],
})
export class AdminModule {}
