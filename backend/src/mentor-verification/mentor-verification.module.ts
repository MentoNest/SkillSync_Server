import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { MentorVerificationRequest } from './entities/mentor-verification-request.entity';
import { AdminMentorVerificationController, MentorVerificationController } from './mentor-verification.controller';
import { MentorVerificationService } from './mentor-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([MentorProfile, MentorVerificationRequest])],
  controllers: [AdminMentorVerificationController, MentorVerificationController],
  providers: [MentorVerificationService],
  exports: [MentorVerificationService],
})
export class MentorVerificationModule {}
