// src/mentors/mentors.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MentorProfile,
  MentorProfileStatus,
} from './entities/mentors-profile.entity';
import { CreateMentorProfileDto } from './dto/create-mentors-profile.dto';
import { UpdateMentorProfileDto } from './dto/update-mentors-profile.dto';

@Injectable()
export class MentorsService {
  private readonly logger = new Logger(MentorsService.name);

  // Allowed status transitions
  private readonly allowedTransitions: Record<
    MentorProfileStatus,
    MentorProfileStatus[]
  > = {
    [MentorProfileStatus.DRAFT]: [MentorProfileStatus.SUBMITTED],
    [MentorProfileStatus.SUBMITTED]: [
      MentorProfileStatus.APPROVED,
      MentorProfileStatus.REJECTED,
    ],
    [MentorProfileStatus.APPROVED]: [],
    [MentorProfileStatus.REJECTED]: [MentorProfileStatus.DRAFT],
  };

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
  ) {}

  async createProfile(
    userId: string,
    dto: CreateMentorProfileDto,
  ): Promise<MentorProfile> {
    // Check if profile already exists
    const existing = await this.mentorProfileRepository.findOne({
      where: { userId },
    });
    if (existing) {
      throw new BadRequestException(
        'Mentor profile already exists for this user',
      );
    }

    const profile = this.mentorProfileRepository.create({
      userId,
      ...dto,
      status: MentorProfileStatus.DRAFT,
    });

    const saved = await this.mentorProfileRepository.save(profile);
    this.logger.log(`Created mentor profile ${saved.id} for user ${userId}`);

    return saved;
  }

  async getProfileByUserId(userId: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdateMentorProfileDto,
  ): Promise<MentorProfile> {
    const profile = await this.getProfileByUserId(userId);

    // Only allow updates in draft status
    if (profile.status !== MentorProfileStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot update profile in ${profile.status} status. Profile must be in draft status.`,
      );
    }

    Object.assign(profile, dto);
    const updated = await this.mentorProfileRepository.save(profile);

    this.logger.log(`Updated mentor profile ${updated.id}`);
    return updated;
  }

  async submitProfile(userId: string): Promise<MentorProfile> {
    const profile = await this.getProfileByUserId(userId);

    this.validateTransition(profile.status, MentorProfileStatus.SUBMITTED);

    profile.status = MentorProfileStatus.SUBMITTED;
    const updated = await this.mentorProfileRepository.save(profile);

    this.logger.log(`Submitted mentor profile ${updated.id} for review`);
    return updated;
  }

  async approveProfile(profileId: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    this.validateTransition(profile.status, MentorProfileStatus.APPROVED);

    profile.status = MentorProfileStatus.APPROVED;
    const updated = await this.mentorProfileRepository.save(profile);

    this.logger.log(`Approved mentor profile ${updated.id}`);
    return updated;
  }

  async rejectProfile(
    profileId: string,
    reason?: string,
  ): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    this.validateTransition(profile.status, MentorProfileStatus.REJECTED);

    profile.status = MentorProfileStatus.REJECTED;
    const updated = await this.mentorProfileRepository.save(profile);

    this.logger.log(
      `Rejected mentor profile ${updated.id}${reason ? `: ${reason}` : ''}`,
    );
    return updated;
  }

  async getAllSubmittedProfiles(): Promise<MentorProfile[]> {
    return this.mentorProfileRepository.find({
      where: { status: MentorProfileStatus.SUBMITTED },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  private validateTransition(
    currentStatus: MentorProfileStatus,
    newStatus: MentorProfileStatus,
  ): void {
    const allowed = this.allowedTransitions[currentStatus];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}. ` +
          `Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none'}`,
      );
    }
  }

  validateOwnership(userId: string, profile: MentorProfile): void {
    if (profile.userId !== userId) {
      throw new ForbiddenException(
        'You can only modify your own mentor profile',
      );
    }
  }
}
