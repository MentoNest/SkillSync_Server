import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepo: Repository<MenteeProfile>,
    private readonly auditLogService: AuditLogService,
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
      return savedProfile;
    }

    throw new BadRequestException('Unsupported profile type');
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
