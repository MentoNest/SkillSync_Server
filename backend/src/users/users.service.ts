import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { Role } from './entities/role.entity.js';
import { MentorProfile } from './entities/mentor-profile.entity.js';
import { MenteeProfile } from './entities/mentee-profile.entity.js';
import { CreateMentorProfileDto } from './dto/create-mentor-profile.dto.js';
import { CreateMenteeProfileDto } from './dto/create-mentee-profile.dto.js';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto.js';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { UserStatus } from './enums/user-status.enum.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

interface FieldChange {
  oldValue: unknown;
  newValue: unknown;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepo: Repository<MenteeProfile>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles', 'mentorProfile', 'menteeProfile'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Find the user for a wallet address, creating one with default status
   * if this is their first login.
   */
  async findOrCreateByWallet(walletAddress: string): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { walletAddress },
      relations: ['roles'],
    });
    if (existing) {
      return existing;
    }

    const created = this.userRepo.create({ walletAddress });
    return this.userRepo.save(created);
  }

  async createMentorProfile(
    userId: string,
    dto: CreateMentorProfileDto,
  ): Promise<MentorProfile> {
    const user = await this.findById(userId);

    const existing = await this.mentorProfileRepo.findOne({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Mentor profile already exists');
    }

    const profile = this.mentorProfileRepo.create({
      ...dto,
      userId,
    });
    const saved = await this.mentorProfileRepo.save(profile);

    const hasRole = user.roles?.some((r) => r.name === AuthRole.MENTOR);
    if (!hasRole) {
      const role = this.roleRepo.create({ name: AuthRole.MENTOR, user });
      await this.roleRepo.save(role);
    }

    this.logger.log(
      JSON.stringify({
        event: 'PROFILE_CREATED',
        userId,
        profileType: 'mentor',
        profileId: saved.id,
        timestamp: new Date().toISOString(),
      }),
    );

    return saved;
  }

  async createMenteeProfile(
    userId: string,
    dto: CreateMenteeProfileDto,
  ): Promise<MenteeProfile> {
    const user = await this.findById(userId);

    const existing = await this.menteeProfileRepo.findOne({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Mentee profile already exists');
    }

    const profile = this.menteeProfileRepo.create({
      ...dto,
      userId,
    });
    const saved = await this.menteeProfileRepo.save(profile);

    const hasRole = user.roles?.some((r) => r.name === AuthRole.MENTEE);
    if (!hasRole) {
      const role = this.roleRepo.create({ name: AuthRole.MENTEE, user });
      await this.roleRepo.save(role);
    }

    this.logger.log(
      JSON.stringify({
        event: 'PROFILE_CREATED',
        userId,
        profileType: 'mentee',
        profileId: saved.id,
        timestamp: new Date().toISOString(),
      }),
    );

    return saved;
  }

  private applyChanges<T extends Record<string, unknown>>(
    profile: T,
    dto: Record<string, unknown>,
  ): Record<string, FieldChange> {
    const changes: Record<string, FieldChange> = {};
    for (const [key, newValue] of Object.entries(dto)) {
      if (newValue !== undefined) {
        const oldValue = profile[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes[key] = { oldValue, newValue };
          (profile as Record<string, unknown>)[key] = newValue;
        }
      }
    }
    return changes;
  }

  async updateMentorProfile(
    userId: string,
    requesterId: string,
    requesterRoles: string[],
    dto: UpdateMentorProfileDto,
  ): Promise<MentorProfile> {
    const isAdmin = requesterRoles?.includes(AuthRole.ADMIN);
    const isMentor = requesterRoles?.includes(AuthRole.MENTOR);
    if (!isAdmin && !isMentor) {
      throw new ForbiddenException(
        'Only users with the mentor role can update a mentor profile',
      );
    }
    if (userId !== requesterId && !isAdmin) {
      throw new ForbiddenException(
        'Only the profile owner or an admin can update this profile',
      );
    }

    const profile = await this.mentorProfileRepo.findOne({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const changes = this.applyChanges(
      profile as unknown as Record<string, unknown>,
      dto as Record<string, unknown>,
    );

    if (Object.keys(changes).length > 0) {
      profile.profileVersion += 1;
    }

    const saved = await this.mentorProfileRepo.save(profile);

    if (Object.keys(changes).length > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'PROFILE_UPDATED',
          userId,
          profileType: 'mentor',
          profileId: saved.id,
          changes,
          newVersion: saved.profileVersion,
          updatedBy: requesterId,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return saved;
  }

  async updateMenteeProfile(
    userId: string,
    requesterId: string,
    requesterRoles: string[],
    dto: UpdateMenteeProfileDto,
  ): Promise<MenteeProfile> {
    const isAdmin = requesterRoles?.includes(AuthRole.ADMIN);
    const isMentee = requesterRoles?.includes(AuthRole.MENTEE);
    if (!isAdmin && !isMentee) {
      throw new ForbiddenException(
        'Only users with the mentee role can update a mentee profile',
      );
    }
    if (userId !== requesterId && !isAdmin) {
      throw new ForbiddenException(
        'Only the profile owner or an admin can update this profile',
      );
    }

    const profile = await this.menteeProfileRepo.findOne({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }

    const changes = this.applyChanges(
      profile as unknown as Record<string, unknown>,
      dto as Record<string, unknown>,
    );

    if (Object.keys(changes).length > 0) {
      profile.profileVersion += 1;
    }

    const saved = await this.menteeProfileRepo.save(profile);

    if (Object.keys(changes).length > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'PROFILE_UPDATED',
          userId,
          profileType: 'mentee',
          profileId: saved.id,
          changes,
          newVersion: saved.profileVersion,
          updatedBy: requesterId,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return saved;
  }

  async getMentorProfile(userId: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepo.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }
    return profile;
  }

  async getMenteeProfile(userId: string): Promise<MenteeProfile> {
    const profile = await this.menteeProfileRepo.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }
    return profile;
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(userId);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
    }

    const changes = this.applyChanges(
      user as unknown as Record<string, unknown>,
      dto as Record<string, unknown>,
    );

    const saved = await this.userRepo.save(user);

    if (Object.keys(changes).length > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'USER_UPDATED',
          userId,
          changes,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return saved;
  }

  private static readonly ALLOWED_STATUS_TRANSITIONS: Record<
    UserStatus,
    UserStatus[]
  > = {
    [UserStatus.PENDING_VERIFICATION]: [UserStatus.ACTIVE, UserStatus.DELETED],
    [UserStatus.ACTIVE]: [UserStatus.SUSPENDED, UserStatus.DELETED],
    [UserStatus.SUSPENDED]: [UserStatus.ACTIVE, UserStatus.DELETED],
    [UserStatus.DELETED]: [],
  };

  async updateStatus(
    userId: string,
    newStatus: UserStatus,
    adminId: string,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (user.status === newStatus) {
      return user;
    }

    const allowed = UsersService.ALLOWED_STATUS_TRANSITIONS[user.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition user status from '${user.status}' to '${newStatus}'`,
      );
    }

    const oldStatus = user.status;
    user.status = newStatus;
    const saved = await this.userRepo.save(user);

    this.logger.log(
      JSON.stringify({
        event: 'USER_STATUS_CHANGED',
        userId,
        oldStatus,
        newStatus,
        changedBy: adminId,
        timestamp: new Date().toISOString(),
      }),
    );

    return saved;
  }

  async deactivateUser(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.status = UserStatus.DELETED;
    const saved = await this.userRepo.save(user);

    this.logger.log(
      JSON.stringify({
        event: 'USER_DEACTIVATED',
        userId,
        timestamp: new Date().toISOString(),
      }),
    );

    return saved;
  }

  async findAll(
    query: UserQueryDto,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.userRepo.findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: ['roles'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }
}
