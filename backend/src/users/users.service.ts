import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
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
import { CreateProfileDto } from './dto/create-profile.dto';
import { RedisService } from '../redis/redis.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { UserStatus } from './enums/user-status.enum';
import { isValidUsername } from './validators/username.validator';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { AuditEventType } from '../auth/entities/audit-log.entity';

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
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedRoles();
  }

  async findOrCreate(walletAddress: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { walletAddress } });
    if (!user) {
      const menteeRole = await this.roleRepo.findOne({ where: { name: AuthRole.MENTEE } });
      user = this.userRepo.create({ walletAddress, roles: menteeRole ? [menteeRole] : [], status: UserStatus.ACTIVE });
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
  async findActiveById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id, status: UserStatus.ACTIVE } });
  }

  async updateStatus(userId: string, newStatus: UserStatus): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status === UserStatus.DELETED && newStatus !== UserStatus.DELETED) {
      throw new BadRequestException('Cannot reactivate a deleted user');
    }

    user.status = newStatus;
    user.tokenVersion += 1;
    return this.userRepo.save(user);
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

  async checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
    if (!isValidUsername(username)) {
      return { available: false };
    }

    const existingUser = await this.userRepo.findOne({ where: { username } });
    return { available: !existingUser };
  }

  async updateUsername(userId: string, newUsername: string, audit?: RequestAudit): Promise<User> {
    if (!isValidUsername(newUsername)) {
      throw new BadRequestException('Invalid username format');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldUsername = user.username;

    // Check if username is already taken
    const existingUser = await this.userRepo.findOne({ where: { username: newUsername } });
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Username is already taken');
    }

    // Check cooldown (30 days between username changes)
    if (user.usernameChangedAt) {
      const cooldownPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      const timeSinceLastChange = Date.now() - user.usernameChangedAt.getTime();
      if (timeSinceLastChange < cooldownPeriod) {
        const daysRemaining = Math.ceil((cooldownPeriod - timeSinceLastChange) / (24 * 60 * 60 * 1000));
        throw new BadRequestException(
          `You can change your username again in ${daysRemaining} days`,
        );
      }
    }

    user.username = newUsername;
    user.usernameChangedAt = new Date();
    
    // Set default display name based on wallet address if not set
    if (!user.displayName && user.walletAddress) {
      user.displayName = `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    }

    const savedUser = await this.userRepo.save(user);

    // Log username change in audit log
    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: AuditEventType.USERNAME_CHANGED,
        audit,
        details: {
          oldUsername,
          newUsername,
        },
      });
    }

    return savedUser;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.displayName = displayName;
    return this.userRepo.save(user);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async featureMentor(userId: string, audit?: RequestAudit): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Mentor not found');
    
    // Enforce max featured mentors
    const maxFeatured = 10;
    const currentFeaturedCount = await this.userRepo.count({ where: { isFeatured: true } });
    
    if (!user.isFeatured && currentFeaturedCount >= maxFeatured) {
      throw new BadRequestException(`Maximum of ${maxFeatured} featured mentors reached`);
    }

    user.isFeatured = true;
    user.featuredAt = new Date();
    // Sort logic (just set to count if not set)
    if (user.featuredOrder === null || user.featuredOrder === undefined) {
       const maxOrderUser = await this.userRepo.findOne({
          where: { isFeatured: true },
          order: { featuredOrder: 'DESC' }
       });
       user.featuredOrder = maxOrderUser?.featuredOrder != null ? maxOrderUser.featuredOrder + 1 : 1;
    }

    const saved = await this.userRepo.save(user);

    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: 'MENTOR_FEATURED' as AuditEventType,
        audit,
        details: { featuredOrder: user.featuredOrder },
      });
    }

    return saved;
  }

  async unfeatureMentor(userId: string, audit?: RequestAudit): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isFeatured = false;
    user.featuredAt = null;
    user.featuredOrder = null;

    const saved = await this.userRepo.save(user);

    if (audit) {
      await this.auditLogService.logEvent({
        userId,
        eventType: 'MENTOR_UNFEATURED' as AuditEventType,
        audit,
        details: {},
      });
    }

    return saved;
  }

  async getFeaturedMentors(page: number = 1, limit: number = 10): Promise<{ items: User[], meta: { total: number, page: number, lastPage: number } }> {
    const [items, total] = await this.userRepo.findAndCount({
      where: { isFeatured: true },
      order: { featuredOrder: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
