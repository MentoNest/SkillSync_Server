import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';

/**
 * Fix #1171: minimal admin verification/revocation for mentor profiles.
 * Sets isVerified + verifiedAt/verifiedBy so a trust badge can be shown.
 */
@Injectable()
export class MentorVerificationService {
  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
  ) {}

  async verify(mentorId: string, adminId: string): Promise<void> {
    await this.mentorProfileRepo.update(
      { id: mentorId },
      {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: adminId,
      } as Partial<MentorProfile>,
    );
  }

  async revoke(mentorId: string): Promise<void> {
    await this.mentorProfileRepo.update(
      { id: mentorId },
      { isVerified: false, verifiedAt: null, verifiedBy: null } as Partial<MentorProfile>,
    );
  }
}
