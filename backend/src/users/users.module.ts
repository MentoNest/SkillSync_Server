import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { Role } from './entities/role.entity.js';
import { MentorProfile } from './entities/mentor-profile.entity.js';
import { MenteeProfile } from './entities/mentee-profile.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { jwtModuleConfig } from '../config/jwt.config.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, MentorProfile, MenteeProfile]),
    JwtModule.registerAsync(jwtModuleConfig),
    ConfigModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtAuthGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
