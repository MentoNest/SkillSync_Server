import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { MenteeProfile } from '../entities/mentee-profile.entity';
import { AuditLogService } from './audit-log.service';
import { CreateProfileDto, ProfileType } from '../dto/create-profile.dto';
import { CreateMentorProfileDto, UpdateMentorProfileDto } from '../dto/mentor-profile.dto';
import { CreateMenteeProfileDto, UpdateMenteeProfileDto } from '../dto/mentee-profile.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepository: Repository<MenteeProfile>,
    private readonly auditLogService: AuditLogService,
  ) {}

  // POST /user/profile - Create either mentor or mentee profile
  async createProfile(userId: string, createProfileDto: CreateProfileDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: {
        roles: true,
        mentorProfile: true,
        menteeProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (createProfileDto.profileType === ProfileType.MENTOR) {
      // Check if mentor profile already exists
      const existingMentorProfile = await this.mentorProfileRepository.findOne({
        where: { userId },
      });

      if (existingMentorProfile || user.mentorProfile) {
        throw new ConflictException('Mentor profile already exists for this user');
      }

      // Create mentor profile
      const mentorProfile = this.mentorProfileRepository.create({
        userId: user.id,
        bio: createProfileDto.bio,
        skills: createProfileDto.skills || [],
        hourlyRate: createProfileDto.hourlyRate ?? 0,
        expertiseAreas: createProfileDto.expertiseAreas || [],
        yearsOfExperience: createProfileDto.yearsOfExperience ?? 0,
        currentRole: createProfileDto.currentRole,
        company: createProfileDto.company,
        education: createProfileDto.education || [],
        certifications: createProfileDto.certifications || [],
        languagesSpoken: createProfileDto.languagesSpoken || [],
        mentoringStyle: createProfileDto.mentoringStyle,
        isVerified: createProfileDto.isVerified ?? false,
        totalMentoringHours: 0,
        averageRating: 0,
        numberOfReviews: 0,
      });

      mentorProfile.calculateProfileCompletion();
      const savedProfile = await this.mentorProfileRepository.save(mentorProfile);

      // Update user role to include mentor if not present
      await this.ensureRole(user, 'mentor');

      // Audit log entry
      await this.auditLogService.log(
        user.id,
        'CREATE_PROFILE',
        'mentor_profile',
        savedProfile.id,
        {
          profileType: ProfileType.MENTOR,
          hourlyRate: savedProfile.hourlyRate,
          skills: savedProfile.skills,
        },
      );

      return savedProfile;
    } else if (createProfileDto.profileType === ProfileType.MENTEE) {
      // Check if mentee profile already exists
      const existingMenteeProfile = await this.menteeProfileRepository.findOne({
        where: { userId },
      });

      if (existingMenteeProfile || user.menteeProfile) {
        throw new ConflictException('Mentee profile already exists for this user');
      }

      // Create mentee profile
      const menteeProfile = this.menteeProfileRepository.create({
        userId: user.id,
        learningGoals: createProfileDto.learningGoals || [],
        areasOfInterest: createProfileDto.areasOfInterest || [],
        currentSkillLevel: createProfileDto.currentSkillLevel,
        preferredMentoringStyle: createProfileDto.preferredMentoringStyle || [],
        timeCommitment: createProfileDto.timeCommitment ?? 0,
        professionalBackground: createProfileDto.professionalBackground,
        jobTitle: createProfileDto.jobTitle,
        industry: createProfileDto.industry,
        portfolioLinks: createProfileDto.portfolioLinks || [],
      });

      menteeProfile.calculateProfileCompletion();
      const savedProfile = await this.menteeProfileRepository.save(menteeProfile);

      // Update user role to include mentee if not present
      await this.ensureRole(user, 'mentee');

      // Audit log entry
      await this.auditLogService.log(
        user.id,
        'CREATE_PROFILE',
        'mentee_profile',
        savedProfile.id,
        {
          profileType: ProfileType.MENTEE,
          currentSkillLevel: savedProfile.currentSkillLevel,
        },
      );

      return savedProfile;
    } else {
      throw new BadRequestException('Invalid profile type');
    }
  }

  // Mentor Profile CRUD operations
  async getMentorProfile(userId: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return profile;
  }

  async getMentorProfileById(id: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return profile;
  }

  async updateMentorProfile(
    userId: string,
    updateDto: UpdateMentorProfileDto,
  ): Promise<MentorProfile> {
    const profile = await this.getMentorProfile(userId);

    Object.assign(profile, updateDto);
    profile.calculateProfileCompletion();

    const updatedProfile = await this.mentorProfileRepository.save(profile);

    await this.auditLogService.log(
      userId,
      'UPDATE_PROFILE',
      'mentor_profile',
      updatedProfile.id,
      { updatedFields: Object.keys(updateDto) },
    );

    return updatedProfile;
  }

  async deleteMentorProfile(userId: string): Promise<{ success: boolean; message: string }> {
    const profile = await this.getMentorProfile(userId);
    await this.mentorProfileRepository.remove(profile);

    await this.auditLogService.log(
      userId,
      'DELETE_PROFILE',
      'mentor_profile',
      profile.id,
    );

    return { success: true, message: 'Mentor profile deleted successfully' };
  }

  // Mentee Profile CRUD operations
  async getMenteeProfile(userId: string): Promise<MenteeProfile> {
    const profile = await this.menteeProfileRepository.findOne({
      where: { userId },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }

    return profile;
  }

  async getMenteeProfileById(id: string): Promise<MenteeProfile> {
    const profile = await this.menteeProfileRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }

    return profile;
  }

  async updateMenteeProfile(
    userId: string,
    updateDto: UpdateMenteeProfileDto,
  ): Promise<MenteeProfile> {
    const profile = await this.getMenteeProfile(userId);

    Object.assign(profile, updateDto);
    profile.calculateProfileCompletion();

    const updatedProfile = await this.menteeProfileRepository.save(profile);

    await this.auditLogService.log(
      userId,
      'UPDATE_PROFILE',
      'mentee_profile',
      updatedProfile.id,
      { updatedFields: Object.keys(updateDto) },
    );

    return updatedProfile;
  }

  async deleteMenteeProfile(userId: string): Promise<{ success: boolean; message: string }> {
    const profile = await this.getMenteeProfile(userId);
    await this.menteeProfileRepository.remove(profile);

    await this.auditLogService.log(
      userId,
      'DELETE_PROFILE',
      'mentee_profile',
      profile.id,
    );

    return { success: true, message: 'Mentee profile deleted successfully' };
  }

  // Helper to ensure user has a specific role
  private async ensureRole(user: User, roleName: string): Promise<void> {
    const hasRole = user.roles.some(r => r.name === roleName);
    if (!hasRole) {
      let role = await this.roleRepository.findOne({ where: { name: roleName } });
      if (!role) {
        role = this.roleRepository.create({
          name: roleName,
          description: `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`,
        });
        role = await this.roleRepository.save(role);
      }
      user.roles.push(role);
      user.tokenVersion += 1;
      await this.userRepository.save(user);
    }
  }
}
