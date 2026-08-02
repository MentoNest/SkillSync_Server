import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller.js';
import { ProfilesController } from './profiles.controller.js';
import { UsersService } from './users.service.js';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { User } from './entities/user.entity.js';
import { Role } from './entities/role.entity.js';
import { MentorProfile } from './entities/mentor-profile.entity.js';
import { MenteeProfile } from './entities/mentee-profile.entity.js';
import { PortfolioLink } from './entities/portfolio-link.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service.js';
import { jwtModuleConfig } from '../config/jwt.config.js';
import { StorageModule } from '../storage/storage.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { ProfileCompletenessService } from './profile-completeness.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      MentorProfile,
      MenteeProfile,
      PortfolioLink,
    ]),
    JwtModule.registerAsync(jwtModuleConfig),
    ConfigModule,
    StorageModule,
    AvailabilityModule,
  ],
  controllers: [UsersController, ProfilesController, AvatarController],
  providers: [
    UsersService,
    JwtAuthGuard,
    RolesGuard,
    TokenBlacklistService,
    AvatarService,
    ProfileCompletenessService,
  ],
  exports: [UsersService, ProfileCompletenessService],
})
export class UsersModule {}
