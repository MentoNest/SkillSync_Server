import {
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
}
