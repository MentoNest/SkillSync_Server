import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../auth/auth.types';
import { DuplicateResourceException } from '../common/errors/app-exceptions';
import { ChangeReason } from '../profile-history/profile-history.entity';
import { ProfileHistoryService } from '../profile-history/profile-history.service';
import { MenteeProfile } from './mentee-profile.entity';
import { MentorProfile } from './mentor-profile.entity';
import {
  CreateProfileDto,
  ExperienceLevel,
  ProfileType,
} from './dto/create-profile.dto';

export interface CreateProfileResult {
  profileType: ProfileType;
  profile: MentorProfile | MenteeProfile;
}

@Injectable()
export class ProfileService {
  private readonly audit = new Logger('ProfileAudit');

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeRepo: Repository<MenteeProfile>,
    private readonly dataSource: DataSource,
    private readonly history: ProfileHistoryService,
  ) {}

  async createProfile(
    walletAddress: string,
    dto: CreateProfileDto,
  ): Promise<CreateProfileResult> {
    if (dto.profileType === ProfileType.MENTOR) {
      return this.createMentorProfile(walletAddress, dto);
    }
    return this.createMenteeProfile(walletAddress, dto);
  }

  // ─── Mentor ───────────────────────────────────────────────────────────────

  private async createMentorProfile(
    walletAddress: string,
    dto: CreateProfileDto,
  ): Promise<CreateProfileResult> {
    const existing = await this.mentorRepo.findOneBy({ walletAddress });
    if (existing) {
      throw new DuplicateResourceException(
        'A mentor profile already exists for this account.',
      );
    }

    const profile = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(MentorProfile, {
        walletAddress,
        bio: dto.bio!,
        skills: dto.skills!,
        hourlyRateUsdCents: dto.hourlyRateUsdCents ?? null,
        maxMentees: dto.maxMentees ?? 3,
        languages: dto.languages ?? ['English'],
        isActive: true,
      });
      const saved = await manager.save(entity);

      // Ensure the 'mentor' role row exists, then assign it.
      await manager.query(
        `INSERT INTO roles (name, permissions)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (name) DO NOTHING`,
        [Role.MENTOR, JSON.stringify([])],
      );
      await manager.query(
        `INSERT INTO user_roles (wallet_address, role_name)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, role_name) DO NOTHING`,
        [walletAddress, Role.MENTOR],
      );

      return saved;
    });

    this.audit.log(
      `mentor_profile_created address=${walletAddress} skills=${dto.skills!.join(',')}`,
    );

    // Record each initial field value in profile history (non-blocking).
    void this.recordCreationHistory(walletAddress, 'mentor', profile);

    return { profileType: ProfileType.MENTOR, profile };
  }

  // ─── Mentee ───────────────────────────────────────────────────────────────

  private async createMenteeProfile(
    walletAddress: string,
    dto: CreateProfileDto,
  ): Promise<CreateProfileResult> {
    const existing = await this.menteeRepo.findOneBy({ walletAddress });
    if (existing) {
      throw new DuplicateResourceException(
        'A mentee profile already exists for this account.',
      );
    }

    const profile = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(MenteeProfile, {
        walletAddress,
        learningGoals: dto.learningGoals!,
        interests: dto.interests!,
        budgetUsdCentsPerMonth: dto.budgetUsdCentsPerMonth ?? null,
        experienceLevel: dto.experienceLevel! as ExperienceLevel,
        languages: dto.languages ?? ['English'],
        isActive: true,
      });
      const saved = await manager.save(entity);

      await manager.query(
        `INSERT INTO roles (name, permissions)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (name) DO NOTHING`,
        [Role.MENTEE, JSON.stringify([])],
      );
      await manager.query(
        `INSERT INTO user_roles (wallet_address, role_name)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, role_name) DO NOTHING`,
        [walletAddress, Role.MENTEE],
      );

      return saved;
    });

    this.audit.log(
      `mentee_profile_created address=${walletAddress} level=${dto.experienceLevel}`,
    );

    void this.recordCreationHistory(walletAddress, 'mentee', profile);

    return { profileType: ProfileType.MENTEE, profile };
  }

  // ─── History helpers ──────────────────────────────────────────────────────

  /**
   * Fires audit history for every field written at profile creation.
   * Called with `void` so a history write failure never surfaces to the caller.
   */
  private async recordCreationHistory(
    walletAddress: string,
    profileType: 'mentor' | 'mentee',
    profile: MentorProfile | MenteeProfile,
  ): Promise<void> {
    const changedAt = new Date();
    const entries = Object.entries(profile)
      .filter(([key]) => !['id', 'walletAddress', 'createdAt', 'updatedAt'].includes(key))
      .map(([fieldName, newValue]) => ({
        userId: walletAddress,
        profileType,
        fieldName,
        oldValue: null,
        newValue: newValue as unknown,
        changedBy: walletAddress,
        changeReason: ChangeReason.USER_EDIT,
        changedAt,
      }));

    await this.history.recordMany(entries);
  }
}
