import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service.js';
import { SeedController } from './seed.controller.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../users/entities/role.entity.js';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import { MenteeProfile } from '../users/entities/mentee-profile.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, MentorProfile, MenteeProfile]),
  ],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
