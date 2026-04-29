import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminSeedService } from './admin-seed.service';
import { DemoSeedService } from './demo-seed.service';
import { Role } from '../../modules/auth/entities/role.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { MentorProfile } from '../../modules/user/entities/mentor-profile.entity';
import { MenteeProfile } from '../../modules/user/entities/mentee-profile.entity';
import { AvailabilitySlot, AvailabilityException } from '../../modules/availability/entities/availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role, 
      User, 
      MentorProfile, 
      MenteeProfile, 
      AvailabilitySlot, 
      AvailabilityException
    ]),
    ConfigModule,
  ],
  providers: [AdminSeedService, DemoSeedService],
  exports: [AdminSeedService, DemoSeedService],
})
export class SeedModule {}
