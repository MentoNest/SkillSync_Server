import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { RbacService } from '../../rbac/rbac.service';
import { RoleName } from '../../rbac/roles';
import { REDIS } from '../../redis/redis.module';
import { MenteeProfile, SkillLevel } from '../entities/mentee-profile.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { CreateProfileDto, ProfileType, UpdateProfileDto } from './dto/profile.dto';

const MENTOR_FIELDS = ['bio', 'skills', 'hourlyRate', 'expertiseAreas', 'yearsOfExperience'] as const;
const MENTEE_FIELDS = [
  'learningGoals',
  'areasOfInterest',
  'skillLevel',
  'preferredMentoringStyle',
  'timeCommitmentHours',
  'professionalBackground',
  'jobTitle',
  'industry',
  'portfolioLinks',
] as const;

const PUBLIC_CACHE_TTL = 300;

export interface PublicProfile {
  profileType: ProfileType;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  profileCompleteness: number;
  memberSince: Date;
  [key: string]: unknown;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MentorProfile) private readonly mentorProfiles: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile) private readonly menteeProfiles: Repository<MenteeProfile>,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(userId: string, dto: CreateProfileDto): Promise<Record<string, unknown>> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.profileType === ProfileType.MENTOR) {
      const existing = await this.mentorProfiles.findOne({ where: { userId } });
      if (existing) throw new ConflictException('Mentor profile already exists');
      const created = await this.mentorProfiles.save(this.mentorProfiles.create({ userId, ...dto.mentor }));
      await this.rbac.assignRole(userId, RoleName.MENTOR);
      await this.audit.record({
        event: AuditEvent.PROFILE_CREATED,
        userId,
        metadata: { profileType: ProfileType.MENTOR, profileId: created.id },
      });
      await this.invalidate(userId);
      return this.withCompleteness(created, ProfileType.MENTOR);
    }

    const existing = await this.menteeProfiles.findOne({ where: { userId } });
    if (existing) throw new ConflictException('Mentee profile already exists');
    const created = await this.menteeProfiles.save(
      this.menteeProfiles.create({
        userId,
        ...dto.mentee,
        skillLevel: dto.mentee?.skillLevel ?? SkillLevel.BEGINNER,
      }),
    );
    await this.rbac.assignRole(userId, RoleName.MENTEE);
    await this.audit.record({
      event: AuditEvent.PROFILE_CREATED,
      userId,
      metadata: { profileType: ProfileType.MENTEE, profileId: created.id },
    });
    await this.invalidate(userId);
    return this.withCompleteness(created, ProfileType.MENTEE);
  }

  async update(
    callerId: string,
    roles: string[],
    type: ProfileType,
    dto: UpdateProfileDto,
    targetUserId?: string,
  ): Promise<Record<string, unknown>> {
    const isAdmin = roles.includes(RoleName.ADMIN);
    const userId = isAdmin && targetUserId ? targetUserId : callerId;

    if (!isAdmin) {
      const requiredRole = type === ProfileType.MENTOR ? RoleName.MENTOR : RoleName.MENTEE;
      if (!roles.includes(requiredRole)) {
        throw new ForbiddenException(`Only users with the ${requiredRole} role can update this profile`);
      }
    }

    if (type === ProfileType.MENTOR) {
      const profile = await this.mentorProfiles.findOne({ where: { userId } });
      if (!profile) throw new NotFoundException('Mentor profile not found');
      const changes = this.applyChanges(profile, dto, MENTOR_FIELDS);
      if (!Object.keys(changes).length) return this.withCompleteness(profile, type);
      profile.profileVersion += 1;
      const saved = await this.mentorProfiles.save(profile);
      await this.recordUpdate(callerId, userId, type, changes);
      await this.invalidate(userId);
      return this.withCompleteness(saved, type);
    }

    const profile = await this.menteeProfiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Mentee profile not found');
    const changes = this.applyChanges(profile, dto, MENTEE_FIELDS);
    if (!Object.keys(changes).length) return this.withCompleteness(profile, type);
    profile.profileVersion += 1;
    const saved = await this.menteeProfiles.save(profile);
    await this.recordUpdate(callerId, userId, type, changes);
    await this.invalidate(userId);
    return this.withCompleteness(saved, type);
  }

  async getPublicProfile(userId: string): Promise<PublicProfile> {
    const cacheKey = `public-profile:${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PublicProfile;
    } catch {
      // cache is best-effort
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Profile not found');

    const mentor = await this.mentorProfiles.findOne({ where: { userId } });
    if (mentor) {
      const view = this.toPublicMentor(user, mentor);
      await this.cache(cacheKey, view);
      return view;
    }

    const mentee = await this.menteeProfiles.findOne({ where: { userId } });
    if (!mentee) throw new NotFoundException('Profile not found');
    const view = this.toPublicMentee(user, mentee);
    await this.cache(cacheKey, view);
    return view;
  }

  private async recordUpdate(
    callerId: string,
    targetUserId: string,
    type: ProfileType,
    changes: Record<string, { from: unknown; to: unknown }>,
  ): Promise<void> {
    await this.audit.record({
      event: AuditEvent.PROFILE_UPDATED,
      userId: callerId,
      metadata: { profileType: type, targetUserId, changedFields: Object.keys(changes), changes },
    });
  }

  private applyChanges(
    entity: unknown,
    dto: unknown,
    fields: readonly string[],
  ): Record<string, { from: unknown; to: unknown }> {
    const target = entity as Record<string, unknown>;
    const source = dto as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of fields) {
      const next = source[field];
      if (next === undefined) continue;
      const previous = target[field];
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      changes[field] = { from: previous, to: next };
      target[field] = next;
    }
    return changes;
  }

  private toPublicMentor(user: User, profile: MentorProfile): PublicProfile {
    return {
      profileType: ProfileType.MENTOR,
      userId: user.id,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: profile.bio,
      skills: profile.skills,
      hourlyRate: profile.hourlyRate,
      expertiseAreas: profile.expertiseAreas,
      averageRating: profile.averageRating,
      totalSessions: profile.reviewCount,
      totalMentoringHours: profile.totalMentoringHours,
      isVerified: profile.isVerified,
      // Drives the "Featured" badge on profile cards (#1459).
      isFeatured: profile.isFeatured === true,
      profileCompleteness: this.mentorCompleteness(profile),
      memberSince: user.createdAt,
    };
  }

  private toPublicMentee(user: User, profile: MenteeProfile): PublicProfile {
    return {
      profileType: ProfileType.MENTEE,
      userId: user.id,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      learningGoals: profile.learningGoals,
      areasOfInterest: profile.areasOfInterest,
      isVerified: false,
      profileCompleteness: this.menteeCompleteness(profile),
      memberSince: user.createdAt,
    };
  }

  private withCompleteness(profile: MentorProfile | MenteeProfile, type: ProfileType): Record<string, unknown> {
    const completeness =
      type === ProfileType.MENTOR
        ? this.mentorCompleteness(profile as MentorProfile)
        : this.menteeCompleteness(profile as MenteeProfile);
    return { ...(profile as unknown as Record<string, unknown>), profileCompleteness: completeness };
  }

  private mentorCompleteness(p: MentorProfile): number {
    const checks = [
      Boolean(p.bio),
      p.skills?.length > 0,
      Number(p.hourlyRate) > 0,
      p.expertiseAreas?.length > 0,
      p.yearsOfExperience > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  private menteeCompleteness(p: MenteeProfile): number {
    const checks = [
      p.learningGoals?.length > 0,
      p.areasOfInterest?.length > 0,
      Boolean(p.skillLevel),
      p.preferredMentoringStyle?.length > 0,
      p.timeCommitmentHours > 0,
      Boolean(p.professionalBackground),
      Boolean(p.jobTitle),
      Boolean(p.industry),
      p.portfolioLinks?.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  private async cache(key: string, value: PublicProfile): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', PUBLIC_CACHE_TTL);
    } catch {
      // cache is best-effort
    }
  }

  private async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(`public-profile:${userId}`);
    } catch {
      // cache is best-effort
    }
  }
}
