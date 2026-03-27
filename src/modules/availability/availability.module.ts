import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MentorAvailability } from './entities/mentor-availability.entity';
import { MentorProfile } from '../profile/entities/mentor-profile.entity';
import { AvailabilityService } from './providers/availability.service';
import { AvailabilityController } from './availability.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([MentorAvailability, MentorProfile]),
    AuthModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, RolesGuard],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
