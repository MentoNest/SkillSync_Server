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
import { QueryMentorProfileDto } from './dto/query-mentors-profile.dto';

@Injectable()
export class MentorsService {
  private readonly logger = new Logger(MentorsService.name);

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

  async findAll(queryDto: QueryMentorProfileDto) {
    const { expertise, minPrice, maxPrice, page = 1, limit = 10 } = queryDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.mentorProfileRepository
      .createQueryBuilder('mentor_profile')
      .leftJoinAndSelect('mentor_profile.user', 'user')
      .where('mentor_profile.status = :status', { status: MentorProfileStatus.APPROVED });

    // Filter by expertise (search in headline)
    if (expertise) {
      queryBuilder.andWhere(
        'LOWER(mentor_profile.headline) LIKE LOWER(:expertise)',
        { expertise: `%${expertise}%` }
      );
    }

    // Filter by price range (convert from NGN to kobo for comparison)
    if (minPrice !== undefined && maxPrice !== undefined) {
      const minPriceKobo = minPrice * 100;
      const maxPriceKobo = maxPrice * 100;
      queryBuilder.andWhere(
        'mentor_profile.rateMinor BETWEEN :minPrice AND :maxPrice',
        { minPrice: minPriceKobo, maxPrice: maxPriceKobo }
      );
    } else if (minPrice !== undefined) {
      const minPriceKobo = minPrice * 100;
      queryBuilder.andWhere('mentor_profile.rateMinor >= :minPrice', { 
        minPrice: minPriceKobo 
      });
    } else if (maxPrice !== undefined) {
      const maxPriceKobo = maxPrice * 100;
      queryBuilder.andWhere('mentor_profile.rateMinor <= :maxPrice', { 
        maxPrice: maxPriceKobo 
      });
    }

    queryBuilder.orderBy('mentor_profile.createdAt', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<MentorProfile> {
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!mentorProfile) {
      throw new NotFoundException(`Mentor profile with ID ${id} not found`);
    }

    return mentorProfile;
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

  async updateProfileById(
    id: string,
    userId: string,
    dto: UpdateMentorProfileDto,
  ): Promise<MentorProfile> {
    const profile = await this.findOne(id);
    this.validateOwnership(userId, profile);

    if (profile.status !== MentorProfileStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot update profile in ${profile.status} status. Profile must be in draft status.`,
      );
    }

    Object.assign(profile, dto);
    return await this.mentorProfileRepository.save(profile);
  }

  async remove(id: string, userId: string): Promise<void> {
    const profile = await this.findOne(id);
    this.validateOwnership(userId, profile);

    await this.mentorProfileRepository.softDelete(id);
    this.logger.log(`Soft deleted mentor profile ${id}`);
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