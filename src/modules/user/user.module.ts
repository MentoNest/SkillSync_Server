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
import { MentorAdminService } from './services/mentor-admin.service';
import { MentorService } from './services/mentor.service';
import { AuthModule } from '../auth/auth.module';
import { MentorAdminController } from './controllers/mentor-admin.controller';
import { MentorController } from './controllers/mentor.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, MentorProfile, MenteeProfile, AuditLog, RefreshToken]),
    AuthModule,
  ],
  controllers: [UserController, MentorAdminController, MentorController],
  providers: [UserService, ScheduledCleanupService, MentorAdminService, MentorService],
  exports: [UserService, MentorAdminService, MentorService],
})
export class UserModule {}
