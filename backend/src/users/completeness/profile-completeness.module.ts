import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { AdminCompletenessController, CompletenessController } from './profile-completeness.controller';
import { ProfileCompletenessService } from './profile-completeness.service';
import { RolesGuard } from '../../rbac/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile])],
  controllers: [CompletenessController, AdminCompletenessController],
  providers: [ProfileCompletenessService, RolesGuard],
  exports: [ProfileCompletenessService],
})
export class CompletenessModule {}
