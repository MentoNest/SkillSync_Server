import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ScheduledCleanupService } from './services/scheduled-cleanup.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, MentorProfile, MenteeProfile, AuditLog, RefreshToken]),
    AuthModule,
  ],
  controllers: [UserController],
  providers: [UserService, ScheduledCleanupService],
  exports: [UserService],
})
export class UserModule {}
