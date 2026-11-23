import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilitySlot } from '../availability/availability-slot.entity';
import { MenteeProfile } from '../profile/mentee-profile.entity';
import { MentorProfile } from '../profile/mentor-profile.entity';
import { RoleEntity } from '../user/role.entity';
import { User } from '../user/user.entity';
import { DemoSeedService } from './demo-seed.service';
import { createDemoWallet, DEMO_WALLET_FACTORY } from './demo-wallet';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RoleEntity,
      MentorProfile,
      MenteeProfile,
      AvailabilitySlot,
    ]),
  ],
  providers: [
    DemoSeedService,
    { provide: DEMO_WALLET_FACTORY, useValue: createDemoWallet },
  ],
  exports: [DemoSeedService],
})
export class DemoSeedModule {}
