import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../user/entities/mentor-profile.entity';

export interface VerificationResult {
  mentorId: string;
  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedByAdminId: string | null;
  verificationNotes: string | null;
}

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
  ) {}

  async verifyMentor(
    mentorId: string,
    adminId: string,
    notes?: string,
  ): Promise<VerificationResult> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
    });

    if (!profile) {
      throw new NotFoundException(`Mentor profile ${mentorId} not found`);
    }

    await this.mentorProfileRepository.update(mentorId, {
      isVerified: true,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      verificationNotes: notes ?? null,
    } as Partial<MentorProfile>);

    return {
      mentorId,
      isVerified: true,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      verificationNotes: notes ?? null,
    };
  }

  async revokeVerification(
    mentorId: string,
    adminId: string,
  ): Promise<VerificationResult> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
    });

    if (!profile) {
      throw new NotFoundException(`Mentor profile ${mentorId} not found`);
    }

    await this.mentorProfileRepository.update(mentorId, {
      isVerified: false,
      verifiedAt: null,
      verifiedByAdminId: adminId,
      verificationNotes: null,
    } as Partial<MentorProfile>);

    return {
      mentorId,
      isVerified: false,
      verifiedAt: null,
      verifiedByAdminId: adminId,
      verificationNotes: null,
    };
  }

  async getVerificationStatus(mentorId: string): Promise<VerificationResult> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
    });

    if (!profile) {
      throw new NotFoundException(`Mentor profile ${mentorId} not found`);
    }

    return {
      mentorId,
      isVerified: (profile as any).isVerified ?? false,
      verifiedAt: (profile as any).verifiedAt ?? null,
      verifiedByAdminId: (profile as any).verifiedByAdminId ?? null,
      verificationNotes: (profile as any).verificationNotes ?? null,
    };
  }
}
