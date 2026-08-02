import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../users/entities/role.entity.js';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaginationModule } from '../common/pagination/pagination.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, MentorProfile]),
    AuthModule,
    UsersModule,
    PaginationModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
