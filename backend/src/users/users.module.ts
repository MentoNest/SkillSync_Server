import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { MentorsController } from './mentors.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogService } from '../auth/audit-log.service';
import { FeaturedMentorCron } from './cron/featured-mentor.cron';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), AuthModule],
  controllers: [UsersController, MentorsController],
  providers: [UsersService, AuditLogService, FeaturedMentorCron],
  exports: [UsersService],
})
export class UsersModule {}
