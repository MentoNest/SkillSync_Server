import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Role } from '../auth/auth.types';
import {
  DuplicateResourceException,
  FieldError,
  ResourceNotFoundException,
  ValidationFailedException,
} from '../common/errors/app-exceptions';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { ChangeReason } from '../profile-history/profile-history.entity';
import { ProfileHistoryService } from '../profile-history/profile-history.service';
import { calculateProfileCompleteness } from './profile-completeness.calculator';
import { ProfileCompletenessService } from './profile-completeness.service';
import { MenteeProfile, SkillLevel } from './mentee-profile.entity';
import { MentorProfile } from './mentor-profile.entity';
import { CreateProfileDto, ProfileType } from './dto/create-profile.dto';
import {
  CreateMenteeProfileDto,
  MenteeProfileWithCompletionDto,
  UpdateMenteeProfileDto,
} from './dto/mentee-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface ProfileFieldChange {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

const EDITABLE_PROFILE_FIELDS: Record<ProfileType, ReadonlySet<string>> = {
  [ProfileType.MENTOR]: new Set([
    'bio',
    'skills',
    'expertiseAreas',
    'hourlyRateUsdCents',
    'maxMentees',
    'languages',
    'isActive',
  ]),
  [ProfileType.MENTEE]: new Set([
    'learningGoals',
    'interests',
    'budgetUsdCentsPerMonth',
    'experienceLevel',
    'preferredMentoringStyle',
    'timeCommitmentHoursPerWeek',
    'professionalBackground',
    'jobTitle',
    'industry',
    'portfolioLinks',
    'languages',
    'isActive',
  ]),
};

export interface CreateProfileResult {
  profileType: ProfileType;
  profile: MentorProfile | MenteeProfile;
}

export interface UpdateProfileResult {
  profileType: ProfileType;
  profile: MentorProfile | MenteeProfile;
}

function appendChange<T extends object, K extends keyof T>(
  profile: T,
  fieldName: K,
  newValue: T[K],
  changes: ProfileFieldChange[],
): void {
  const oldValue = profile[fieldName];
  if (
    Object.is(oldValue, newValue) ||
    JSON.stringify(oldValue) === JSON.stringify(newValue)
  ) {
    return;
  }
  Object.assign(profile, { [fieldName]: newValue });
  changes.push({ fieldName: String(fieldName), oldValue, newValue });
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
    private readonly completeness: ProfileCompletenessService,
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

  async updateProfile(
    type: ProfileType,
    actor: AuthUser,
    dto: UpdateProfileDto,
  ): Promise<UpdateProfileResult> {
    const actorAddress = normalizeWalletAddress(actor.address);
    const targetAddress = normalizeWalletAddress(
      dto.walletAddress ?? actorAddress,
    );
    const isAdmin = actor.roles.includes(Role.ADMIN);

    if (!isAdmin && targetAddress !== actorAddress) {
      throw new ForbiddenException('You can only update your own profile.');
    }
    if (type === ProfileType.MENTOR && !isAdmin) {
      const hasMentorRole =
        actor.roles.includes(Role.MENTOR) ||
        (await this.hasPersistedRole(actorAddress, Role.MENTOR));
      if (!hasMentorRole) {
        throw new ForbiddenException(
          'Only users with the mentor role can update a mentor profile.',
        );
      }
    }
    if (type === ProfileType.MENTEE && !isAdmin) {
      const hasMenteeRole =
        actor.roles.includes(Role.MENTEE) ||
        (await this.hasPersistedRole(actorAddress, Role.MENTEE));
      if (!hasMenteeRole) {
        throw new ForbiddenException(
          'Only users with the mentee role can update a mentee profile.',
        );
      }
    }

    const allowedFields = EDITABLE_PROFILE_FIELDS[type];
    const invalidFields: FieldError[] = Object.entries(dto)
      .filter(
        ([field, value]) =>
          field !== 'walletAddress' &&
          value !== undefined &&
          !allowedFields.has(field),
      )
      .map(([field]) => ({
        field,
        errors: [`${field} cannot be updated on a ${type} profile.`],
      }));
    if (invalidFields.length > 0) {
      throw new ValidationFailedException(invalidFields);
    }

    if (type === ProfileType.MENTOR) {
      return this.updateMentorProfile(
        targetAddress,
        actorAddress,
        isAdmin,
        dto,
      );
    }
    return this.updateMenteeProfile(targetAddress, actorAddress, isAdmin, dto);
  }

  // ─── Dedicated Mentee CRUD (restricted to mentee role) ────────────────────

  async getMenteeProfile(
    actor: AuthUser,
  ): Promise<MenteeProfileWithCompletionDto> {
    const walletAddress = normalizeWalletAddress(actor.address);
    await this.assertMenteeAccess(actor, walletAddress);
    const profile = await this.menteeRepo.findOneBy({ walletAddress });
    if (!profile) {
      throw new ResourceNotFoundException('Mentee profile', walletAddress);
    }
    return this.withMenteeCompletion(profile);
  }

  async createMenteeProfileForRole(
    actor: AuthUser,
    dto: CreateMenteeProfileDto,
  ): Promise<MenteeProfileWithCompletionDto> {
    const walletAddress = normalizeWalletAddress(actor.address);
    await this.assertMenteeAccess(actor, walletAddress);
    const created = await this.createMenteeProfile(walletAddress, {
      profileType: ProfileType.MENTEE,
      ...dto,
    });
    return this.withMenteeCompletion(created.profile as MenteeProfile);
  }

  async updateMenteeProfileForRole(
    actor: AuthUser,
    dto: UpdateMenteeProfileDto,
  ): Promise<MenteeProfileWithCompletionDto> {
    const result = await this.updateProfile(ProfileType.MENTEE, actor, dto);
    return this.withMenteeCompletion(result.profile as MenteeProfile);
  }

  async deleteMenteeProfile(actor: AuthUser): Promise<void> {
    const walletAddress = normalizeWalletAddress(actor.address);
    await this.assertMenteeAccess(actor, walletAddress);
    const profile = await this.menteeRepo.findOneBy({ walletAddress });
    if (!profile) {
      throw new ResourceNotFoundException('Mentee profile', walletAddress);
    }
    await this.menteeRepo.delete({ walletAddress });
    await this.completeness.invalidate(walletAddress);
    this.audit.log(`mentee_profile_deleted address=${walletAddress}`);
  }

  private async assertMenteeAccess(
    actor: AuthUser,
    address: string,
  ): Promise<void> {
    if (actor.roles.includes(Role.ADMIN)) return;
    const hasMenteeRole =
      actor.roles.includes(Role.MENTEE) ||
      (await this.hasPersistedRole(address, Role.MENTEE));
    if (!hasMenteeRole) {
      throw new ForbiddenException(
        'Only users with the mentee role can access mentee profiles.',
      );
    }
  }

  private withMenteeCompletion(
    profile: MenteeProfile,
  ): MenteeProfileWithCompletionDto {
    const completeness = calculateProfileCompleteness({
      profileType: 'mentee',
      profile,
      user: {},
      availabilitySlotCount: 0,
      portfolioLinkCount: profile.portfolioLinks?.length ?? 0,
    });
    return {
      profile,
      completionPercentage: completeness.baseScore,
      missingFields: completeness.missingFields.map((field) => field.field),
    };
  }

  private async hasPersistedRole(
    walletAddress: string,
    role: Role,
  ): Promise<boolean> {
    const rows: Array<{ role_name: string }> = await this.dataSource.query(
      'SELECT role_name FROM user_roles WHERE wallet_address = $1 AND role_name = $2 LIMIT 1',
      [walletAddress, role],
    );
    return rows.some((row) => row.role_name === String(role));
  }

  private async updateMentorProfile(
    targetAddress: string,
    actorAddress: string,
    isAdmin: boolean,
    dto: UpdateProfileDto,
  ): Promise<UpdateProfileResult> {
    const profile = await this.mentorRepo.findOneBy({
      walletAddress: targetAddress,
    });
    if (!profile)
      throw new ResourceNotFoundException('Mentor profile', targetAddress);

    const changes: ProfileFieldChange[] = [];
    if (dto.bio !== undefined) appendChange(profile, 'bio', dto.bio, changes);
    if (dto.skills !== undefined)
      appendChange(profile, 'skills', dto.skills, changes);
    if (dto.expertiseAreas !== undefined) {
      appendChange(profile, 'expertiseAreas', dto.expertiseAreas, changes);
    }
    if (dto.hourlyRateUsdCents !== undefined) {
      appendChange(
        profile,
        'hourlyRateUsdCents',
        dto.hourlyRateUsdCents,
        changes,
      );
    }
    if (dto.maxMentees !== undefined) {
      appendChange(profile, 'maxMentees', dto.maxMentees, changes);
    }
    if (dto.languages !== undefined)
      appendChange(profile, 'languages', dto.languages, changes);
    if (dto.isActive !== undefined)
      appendChange(profile, 'isActive', dto.isActive, changes);

    if (changes.length === 0) {
      return { profileType: ProfileType.MENTOR, profile };
    }

    const saved = await this.mentorRepo.save(profile);
    await this.recordProfileChanges(
      targetAddress,
      actorAddress,
      isAdmin,
      ProfileType.MENTOR,
      changes,
    );
    return { profileType: ProfileType.MENTOR, profile: saved };
  }

  private async updateMenteeProfile(
    targetAddress: string,
    actorAddress: string,
    isAdmin: boolean,
    dto: UpdateProfileDto,
  ): Promise<UpdateProfileResult> {
    const profile = await this.menteeRepo.findOneBy({
      walletAddress: targetAddress,
    });
    if (!profile)
      throw new ResourceNotFoundException('Mentee profile', targetAddress);

    const changes: ProfileFieldChange[] = [];
    if (dto.learningGoals !== undefined) {
      appendChange(profile, 'learningGoals', dto.learningGoals, changes);
    }
    if (dto.interests !== undefined)
      appendChange(profile, 'interests', dto.interests, changes);
    if (dto.budgetUsdCentsPerMonth !== undefined) {
      appendChange(
        profile,
        'budgetUsdCentsPerMonth',
        dto.budgetUsdCentsPerMonth,
        changes,
      );
    }
    if (dto.experienceLevel !== undefined) {
      appendChange(
        profile,
        'experienceLevel',
        dto.experienceLevel as SkillLevel,
        changes,
      );
    }
    if (dto.preferredMentoringStyle !== undefined) {
      appendChange(
        profile,
        'preferredMentoringStyle',
        dto.preferredMentoringStyle,
        changes,
      );
    }
    if (dto.timeCommitmentHoursPerWeek !== undefined) {
      appendChange(
        profile,
        'timeCommitmentHoursPerWeek',
        dto.timeCommitmentHoursPerWeek,
        changes,
      );
    }
    if (dto.professionalBackground !== undefined) {
      appendChange(
        profile,
        'professionalBackground',
        dto.professionalBackground,
        changes,
      );
    }
    if (dto.jobTitle !== undefined) {
      appendChange(profile, 'jobTitle', dto.jobTitle, changes);
    }
    if (dto.industry !== undefined) {
      appendChange(profile, 'industry', dto.industry, changes);
    }
    if (dto.portfolioLinks !== undefined) {
      appendChange(profile, 'portfolioLinks', dto.portfolioLinks, changes);
    }
    if (dto.languages !== undefined)
      appendChange(profile, 'languages', dto.languages, changes);
    if (dto.isActive !== undefined)
      appendChange(profile, 'isActive', dto.isActive, changes);

    if (changes.length === 0) {
      return { profileType: ProfileType.MENTEE, profile };
    }

    const saved = await this.menteeRepo.save(profile);
    await this.recordProfileChanges(
      targetAddress,
      actorAddress,
      isAdmin,
      ProfileType.MENTEE,
      changes,
    );
    return { profileType: ProfileType.MENTEE, profile: saved };
  }

  private async recordProfileChanges(
    targetAddress: string,
    actorAddress: string,
    isAdmin: boolean,
    profileType: ProfileType,
    changes: ProfileFieldChange[],
  ): Promise<void> {
    const changedAt = new Date();
    await this.history.recordMany(
      changes.map((change) => ({
        userId: targetAddress,
        profileType,
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changedBy: actorAddress,
        changeReason: isAdmin
          ? ChangeReason.ADMIN_EDIT
          : ChangeReason.USER_EDIT,
        changedAt,
      })),
    );
    this.audit.log(
      `profile_updated type=${profileType} address=${targetAddress} actor=${actorAddress} fields=${changes.map((change) => change.fieldName).join(',')}`,
    );
    await this.completeness.invalidate(targetAddress);
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
    await this.completeness.invalidate(walletAddress);

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
        experienceLevel: dto.experienceLevel! as SkillLevel,
        preferredMentoringStyle: dto.preferredMentoringStyle ?? [],
        timeCommitmentHoursPerWeek: dto.timeCommitmentHoursPerWeek ?? null,
        professionalBackground: dto.professionalBackground ?? null,
        jobTitle: dto.jobTitle ?? null,
        industry: dto.industry ?? null,
        portfolioLinks: dto.portfolioLinks ?? [],
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
    await this.completeness.invalidate(walletAddress);

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
      .filter(
        ([key]) =>
          !['id', 'walletAddress', 'createdAt', 'updatedAt'].includes(key),
      )
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
