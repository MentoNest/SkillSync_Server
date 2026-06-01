import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { RedisService } from '../redis/redis.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly PROFILE_CACHE_PREFIX = 'public:profile:';

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepo: Repository<MenteeProfile>,
    private readonly auditLogService: AuditLogService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedRoles();
  }

  async findOrCreate(walletAddress: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { walletAddress } });
    if (!user) {
      const menteeRole = await this.roleRepo.findOne({ where: { name: AuthRole.MENTEE } });
      user = this.userRepo.create({ walletAddress, roles: menteeRole ? [menteeRole] : [] });
      await this.userRepo.save(user);
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async createProfile(userId: string, dto: CreateProfileDto, audit: RequestAudit): Promise<MentorProfile | MenteeProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.profileType === AuthRole.MENTOR) {
      const existing = await this.mentorProfileRepo.findOne({ where: { user: { id: userId } } });
      if (existing) {
        throw new ConflictException('Mentor profile already exists');
      }

      const mentorProfile = this.mentorProfileRepo.create({
        user,
        bio: dto.bio!,
        expertise: dto.expertise,
        yearsOfExperience: dto.yearsOfExperience!,
        preferredMentoringStyle: dto.preferredMentoringStyle,
        availabilityHoursPerWeek: dto.availabilityHoursPerWeek,
        availabilityDetails: dto.availabilityDetails,
      });

      const savedProfile = await this.mentorProfileRepo.save(mentorProfile);
      await this.assignRole(userId, AuthRole.MENTOR);
      await this.auditLogService.logEvent({
        userId: user.id,
        eventType: AuditEventType.PROFILE_CREATED,
        audit,
        details: {
          profileType: dto.profileType,
          profileId: savedProfile.id,
        },
      });
      // Invalidate cache
      await this.invalidateProfileCache(userId);
      return savedProfile;
    }

    if (dto.profileType === AuthRole.MENTEE) {
      const existing = await this.menteeProfileRepo.findOne({ where: { user: { id: userId } } });
      if (existing) {
        throw new ConflictException('Mentee profile already exists');
      }

      const menteeProfile = this.menteeProfileRepo.create({
        user,
        learningGoals: dto.learningGoals!,
        areasOfInterest: dto.areasOfInterest,
        currentSkillLevel: dto.currentSkillLevel!,
        preferredMentoringStyle: dto.preferredMentoringStyle,
        timeCommitmentHoursPerWeek: dto.timeCommitmentHoursPerWeek!,
        professionalBackground: dto.professionalBackground,
        jobTitle: dto.jobTitle,
        industry: dto.industry,
        portfolioLinks: dto.portfolioLinks,
      });

      const savedProfile = await this.menteeProfileRepo.save(menteeProfile);
      await this.assignRole(userId, AuthRole.MENTEE);
      await this.auditLogService.logEvent({
        userId: user.id,
        eventType: AuditEventType.PROFILE_CREATED,
        audit,
        details: {
          profileType: dto.profileType,
          profileId: savedProfile.id,
        },
      });
      // Invalidate cache
      await this.invalidateProfileCache(userId);
      return savedProfile;
    }

    throw new BadRequestException('Unsupported profile type');
  }

  async updateProfile(
    requesterId: string,
    profileType: AuthRole,
    dto: UpdateProfileDto,
    audit: RequestAudit,
    targetUserId?: string,
  ): Promise<MentorProfile | MenteeProfile> {
    const user = await this.userRepo.findOne({ where: { id: requesterId } });
    if (!user) throw new NotFoundException('User not found');

    const isAdmin = user.roles.some((role) => role.name === AuthRole.ADMIN);
    const isMentorUser = user.roles.some((role) => role.name === AuthRole.MENTOR);
    if (profileType === AuthRole.MENTOR && !isAdmin && !isMentorUser) {
      throw new ForbiddenException('Only mentors can update mentor profile');
    }

    const repository = profileType === AuthRole.MENTOR ? this.mentorProfileRepo : this.menteeProfileRepo;
    const userIdToUpdate = targetUserId ?? requesterId;
    const profile = await (repository as any).findOne({ where: { user: { id: userIdToUpdate } }, relations: { user: true } });
    if (!profile) {
      throw new NotFoundException(`${profileType} profile not found`);
    }

    if (!isAdmin && profile.user.id !== requesterId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const sanitized = this.sanitizeUpdateDto(dto);
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    const allowedFields = this.getAllowedProfileFields(profileType);

    for (const [key, value] of Object.entries(sanitized)) {
      if (!allowedFields.includes(key)) {
        continue;
      }
      const oldValue = (profile as any)[key];
      if (this.isDifferent(oldValue, value)) {
        changes.push({ field: key, oldValue, newValue: value });
        (profile as any)[key] = value;
      }
    }

    if (changes.length === 0) {
      return profile;
    }

    if ('profileVersion' in profile) {
      (profile as any).profileVersion += 1;
    }

    const savedProfile = await (repository as any).save(profile);
    await this.auditLogService.logEvent({
      userId: user.id,
      eventType: AuditEventType.PROFILE_UPDATED,
      audit,
      details: {
        profileType,
        profileId: savedProfile.id,
        changes,
      },
    });
    // Invalidate cache
    await this.invalidateProfileCache(userIdToUpdate);
    return savedProfile;
  }

  private sanitizeUpdateDto(dto: UpdateProfileDto): Partial<UpdateProfileDto> {
    const sanitized: Partial<UpdateProfileDto> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'string') {
        sanitized[key as keyof UpdateProfileDto] = value.trim() as any;
        continue;
      }

      if (Array.isArray(value)) {
        sanitized[key as keyof UpdateProfileDto] = value
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim()) as any;
        continue;
      }

      sanitized[key as keyof UpdateProfileDto] = value as any;
    }
    return sanitized;
  }

  private isDifferent(oldValue: unknown, newValue: unknown): boolean {
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length) return true;
      return oldValue.some((item, index) => item !== newValue[index]);
    }
    return oldValue !== newValue;
  }

  private getAllowedProfileFields(profileType: AuthRole): string[] {
    if (profileType === AuthRole.MENTOR) {
      return [
        'bio',
        'expertise',
        'yearsOfExperience',
        'preferredMentoringStyle',
        'availabilityHoursPerWeek',
        'availabilityDetails',
      ];
    }

    return [
      'learningGoals',
      'areasOfInterest',
      'currentSkillLevel',
      'preferredMentoringStyle',
      'timeCommitmentHoursPerWeek',
      'professionalBackground',
      'jobTitle',
      'industry',
      'portfolioLinks',
    ];
  }

  async assignRole(userId: string, roleName: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.roleRepo.findOne({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role '${roleName}' not found`);

    if (!user.roles.some((r) => r.name === roleName)) {
      user.roles = [...user.roles, role];
      user.tokenVersion += 1;
      await this.userRepo.save(user);
    }
    return user;
  }

  async revokeRole(userId: string, roleName: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.roles = user.roles.filter((r) => r.name !== roleName);
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    return user;
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.userRepo.increment({ id: userId }, 'tokenVersion', 1);
  }

  /**
   * Invalidate cached public profile in Redis
   */
  private async invalidateProfileCache(userId: string): Promise<void> {
    try {
      const cacheKey = `${this.PROFILE_CACHE_PREFIX}${userId}`;
      await this.redisService.del(cacheKey);
    } catch (error) {
      // Cache errors should not break profile operations
      console.error(`Error invalidating profile cache for ${userId}:`, error);
    }
  }

  private async seedRoles(): Promise<void> {
    const predefined = [
      { name: AuthRole.ADMIN, description: 'Full system access' },
      { name: AuthRole.MENTOR, description: 'Can mentor other users' },
      { name: AuthRole.MENTEE, description: 'Default role for new users' },
    ];

    for (const r of predefined) {
      const exists = await this.roleRepo.findOne({ where: { name: r.name } });
      if (!exists) {
        await this.roleRepo.save(this.roleRepo.create(r));
      }
    }
  }
}
