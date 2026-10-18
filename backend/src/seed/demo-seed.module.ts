import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../rbac/entities/role.entity';
import { MenteeProfile } from '../users/entities/mentee-profile.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { User } from '../users/entities/user.entity';
import { DemoSeedBootstrap } from './demo-seed.bootstrap';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile, MenteeProfile, Role])],
  providers: [DemoSeedService, DemoSeedBootstrap],
  exports: [DemoSeedService],
})
export class DemoSeedModule {}
