import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import {
  MentorVerificationStatusDto,
  RequestVerificationDto,
  VerificationMethod,
  VerifyMentorDto,
} from './dto/mentor-verification.dto';
import {
  MentorVerificationRequest,
  VerificationRequestStatus,
} from './entities/mentor-verification-request.entity';

@Injectable()
export class MentorVerificationService {
  constructor(
    @InjectRepository(MentorProfile) private readonly profiles: Repository<MentorProfile>,
    @InjectRepository(MentorVerificationRequest) private readonly requests: Repository<MentorVerificationRequest>,
    private readonly audit: AuditService,
  ) {}

  /** Verify a mentor. Requires an explicit method and records an audit entry. */
  async verify(mentorId: string, adminId: string, dto: VerifyMentorDto): Promise<MentorProfile> {
    if (!dto?.method || !Object.values(VerificationMethod).includes(dto.method)) {
      throw new BadRequestException('A verification method (email, id or credential) is required');
    }
    const profile = await this.findProfile(mentorId);
    if (!profile) throw new NotFoundException('Mentor profile not found');

    profile.isVerified = true;
    profile.verifiedAt = new Date();
    profile.verifiedBy = adminId;
    profile.verificationMethod = dto.method;
    profile.verificationNotes = dto.notes ?? null;
    const saved = await this.profiles.save(profile);

    await this.requests.update(
      { mentorId: profile.userId, status: VerificationRequestStatus.PENDING },
      { status: VerificationRequestStatus.APPROVED, resolvedAt: new Date() },
    );
    await this.audit.record({
      event: AuditEvent.MENTOR_VERIFIED,
      userId: adminId,
      metadata: { mentorId: profile.userId, method: dto.method },
    });
    return saved;
  }

  /** Remove a mentor's verification (admin only), with an audit entry. */
  async revoke(mentorId: string, adminId: string): Promise<MentorProfile> {
    const profile = await this.findProfile(mentorId);
    if (!profile) throw new NotFoundException('Mentor profile not found');

    profile.isVerified = false;
    profile.verifiedAt = null;
    profile.verificationMethod = null;
    profile.verifiedBy = adminId;
    const saved = await this.profiles.save(profile);

    await this.audit.record({
      event: AuditEvent.MENTOR_VERIFICATION_REVOKED,
      userId: adminId,
      metadata: { mentorId: profile.userId },
    });
    return saved;
  }

  /** User-initiated verification request; creates (or reuses) a pending admin task. */
  async requestVerification(userId: string, dto: RequestVerificationDto = {}): Promise<MentorVerificationRequest> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Mentor profile not found');
    if (profile.isVerified) throw new BadRequestException('Mentor profile is already verified');

    const existing = await this.requests.findOne({
      where: { mentorId: userId, status: VerificationRequestStatus.PENDING },
    });
    if (existing) return existing;

    const request = await this.requests.save(
      this.requests.create({
        mentorId: userId,
        status: VerificationRequestStatus.PENDING,
        note: dto.note ?? null,
        resolvedAt: null,
      }),
    );
    await this.audit.record({
      event: AuditEvent.MENTOR_VERIFICATION_REQUESTED,
      userId,
      metadata: { requestId: request.id },
    });
    return request;
  }

  /** Pending verification requests for the admin dashboard. */
  async pending(): Promise<MentorVerificationRequest[]> {
    return this.requests.find({
      where: { status: VerificationRequestStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /** Public verification status / badge for a mentor profile. */
  async status(mentorId: string): Promise<MentorVerificationStatusDto> {
    const profile = await this.findProfile(mentorId);
    if (!profile) throw new NotFoundException('Mentor profile not found');
    return {
      mentorId: profile.userId,
      isVerified: profile.isVerified,
      verifiedAt: profile.verifiedAt ? profile.verifiedAt.toISOString() : null,
      method: profile.verificationMethod,
      badge: profile.isVerified ? 'verified' : 'unverified',
    };
  }

  private findProfile(mentorId: string): Promise<MentorProfile | null> {
    return this.profiles.findOne({ where: [{ userId: mentorId }, { id: mentorId }] });
  }
}
