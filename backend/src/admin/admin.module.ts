import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProfileHistorySubscriber } from './profile-history.subscriber';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Report } from './entities/report.entity';
import { FlaggedContent } from './entities/flagged-content.entity';
import { Session } from './entities/session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ProfileHistory, Report, FlaggedContent, Session]),
    AuthModule,
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, ProfileHistorySubscriber],
})
export class AdminModule {}