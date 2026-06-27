import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { RedisModule } from '../redis/redis.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuspiciousActivityService } from '../auth/suspicious-activity.service';
import { AuditLogService } from '../auth/audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RedisModule],
  controllers: [AdminController],
  providers: [AdminService, SuspiciousActivityService, AuditLogService],
})
export class AdminModule {}
