import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { ChangeReason } from '../profile-history/profile-history.entity';
import { ProfileHistoryService } from '../profile-history/profile-history.service';
import { MentorProfile } from './mentor-profile.entity';
import {
  MentorVerificationRequestDto,
  QueryMentorVerificationRequestsDto,
  VerificationMethod,
  VerifyMentorDto,
} from './dto/mentor-verification.dto';

@Injectable()
export class MentorVerificationService {
  private readonly audit = new Logger(MentorVerificationService.name);

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentors: Repository<MentorProfile>,
    private readonly history: ProfileHistoryService,
  ) {}

  async verify(
    mentorId: string,
    adminAddress: string,
    dto: VerifyMentorDto,
  ): Promise<{ mentorId: string; isVerified: true; verifiedAt: Date }> {
    if (!Object.values(VerificationMethod).includes(dto.method)) {
      throw new BusinessRuleException(
        'A valid verification method is required.',
      );
    }
    const profile = await this.mentors.findOneBy({ id: mentorId });
    if (!profile)
      throw new ResourceNotFoundException('Mentor profile', mentorId);

    const changedAt = new Date();
    const previousRequestedAt = profile.verificationRequestedAt;
    await this.mentors.update(mentorId, {
      isVerified: true,
      verifiedAt: changedAt,
      verifiedBy: adminAddress,
      verificationMethod: dto.method,
      verificationNotes: dto.notes ?? null,
      verificationRequestedAt: null,
    });

    await this.history.recordMany([
      this.auditChange(
        profile,
        adminAddress,
        'isVerified',
        profile.isVerified,
        true,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verifiedAt',
        profile.verifiedAt,
        changedAt,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verifiedBy',
        profile.verifiedBy,
        adminAddress,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verificationMethod',
        profile.verificationMethod,
        dto.method,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verificationRequestedAt',
        previousRequestedAt,
        null,
        changedAt,
      ),
    ]);
    this.audit.log(
      `mentor_verified mentor=${mentorId} actor=${adminAddress} method=${dto.method}`,
    );
    return { mentorId, isVerified: true, verifiedAt: changedAt };
  }

  async revoke(
    mentorId: string,
    adminAddress: string,
  ): Promise<{ mentorId: string; isVerified: false }> {
    const profile = await this.mentors.findOneBy({ id: mentorId });
    if (!profile)
      throw new ResourceNotFoundException('Mentor profile', mentorId);
    if (!profile.isVerified) {
      throw new DuplicateResourceException('Mentor is not currently verified.');
    }

    const changedAt = new Date();
    await this.mentors.update(mentorId, {
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
      verificationMethod: null,
      verificationNotes: null,
    });
    await this.history.recordMany([
      this.auditChange(
        profile,
        adminAddress,
        'isVerified',
        true,
        false,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verifiedAt',
        profile.verifiedAt,
        null,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verifiedBy',
        profile.verifiedBy,
        null,
        changedAt,
      ),
      this.auditChange(
        profile,
        adminAddress,
        'verificationMethod',
        profile.verificationMethod,
        null,
        changedAt,
      ),
    ]);
    this.audit.warn(
      `mentor_verification_revoked mentor=${mentorId} actor=${adminAddress}`,
    );
    return { mentorId, isVerified: false };
  }

  async requestVerification(
    walletAddress: string,
  ): Promise<{ mentorId: string; status: 'pending'; requestedAt: Date }> {
    const profile = await this.mentors.findOneBy({ walletAddress });
    if (!profile)
      throw new ResourceNotFoundException('Mentor profile', walletAddress);
    if (profile.isVerified) {
      throw new DuplicateResourceException(
        'Mentor profile is already verified.',
      );
    }

    const requestedAt = profile.verificationRequestedAt ?? new Date();
    if (!profile.verificationRequestedAt) {
      await this.mentors.update(profile.id, {
        verificationRequestedAt: requestedAt,
      });
      await this.history.record({
        userId: walletAddress,
        profileType: 'mentor',
        fieldName: 'verificationRequestedAt',
        oldValue: null,
        newValue: requestedAt,
        changedBy: walletAddress,
        changeReason: ChangeReason.USER_EDIT,
        changedAt: requestedAt,
      });
      this.audit.log(`mentor_verification_requested mentor=${profile.id}`);
    }
    return { mentorId: profile.id, status: 'pending', requestedAt };
  }

  async getPendingRequests(query: QueryMentorVerificationRequestsDto): Promise<{
    data: MentorVerificationRequestDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [profiles, total] = await this.mentors.findAndCount({
      where: { isVerified: false, verificationRequestedAt: Not(IsNull()) },
      relations: { user: true },
      order: { verificationRequestedAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: profiles.map((profile) =>
        MentorVerificationRequestDto.fromEntity(profile),
      ),
      total,
      page,
      limit,
    };
  }

  private auditChange(
    profile: MentorProfile,
    adminAddress: string,
    fieldName: string,
    oldValue: unknown,
    newValue: unknown,
    changedAt: Date,
  ) {
    return {
      userId: profile.walletAddress,
      profileType: 'mentor',
      fieldName,
      oldValue,
      newValue,
      changedBy: adminAddress,
      changeReason: ChangeReason.ADMIN_EDIT,
      changedAt,
    };
  }
}
