import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../../auth/entities/user.entity';
import { AuditLog, AuditEventType } from '../../auth/entities/audit-log.entity';
import { FeatureMentorDto, FeaturedMentorResponseDto } from '../dto/featured-mentor.dto';
import { AppConfigService } from '../../../config/app-config.service';

@Injectable()
export class MentorAdminService {
  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly appConfigService: AppConfigService,
  ) {}

  async featureMentor(
    mentorId: string,
    dto: FeatureMentorDto,
    adminId: string,
    ipAddress: string,
  ): Promise<FeaturedMentorResponseDto> {
    // Get mentor profile
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
      relations: ['user'],
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    if (!mentorProfile.user) {
      throw new NotFoundException('Associated user not found');
    }

    // Check if already featured
    if (mentorProfile.isFeatured) {
      throw new BadRequestException('Mentor is already featured');
    }

    // Check max featured mentors limit
    const config = this.appConfigService.getFeaturedMentorsConfig();
    const currentFeaturedCount = await this.mentorProfileRepository.count({
      where: { isFeatured: true },
    });

    if (currentFeaturedCount >= config.maxFeaturedMentors) {
      throw new BadRequestException(
        `Maximum featured mentors limit (${config.maxFeaturedMentors}) reached`,
      );
    }

    // Calculate expiry date
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + config.expiryDays);

    // Get the next available featured order
    const maxOrder = await this.mentorProfileRepository.findOne({
      where: { isFeatured: true },
      order: { featuredOrder: 'DESC' },
    });

    const nextOrder = dto.featuredOrder ?? (maxOrder ? maxOrder.featuredOrder + 1 : 0);

    // Feature the mentor
    mentorProfile.isFeatured = true;
    mentorProfile.featuredAt = now;
    mentorProfile.featuredExpiresAt = expiresAt;
    mentorProfile.featuredOrder = nextOrder;

    await this.mentorProfileRepository.save(mentorProfile);

    // Create audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: adminId,
        walletAddress: (await this.userRepository.findOne({ where: { id: adminId } }))
          ?.walletAddress,
        eventType: AuditEventType.MENTOR_FEATURED,
        ipAddress,
        metadata: {
          mentorId,
          mentorName: mentorProfile.user.displayName,
          featuredOrder: nextOrder,
          expiresAt,
        },
      }),
    );

    return this.toResponseDto(mentorProfile);
  }

  async unfeatureMentor(
    mentorId: string,
    adminId: string,
    ipAddress: string,
  ): Promise<FeaturedMentorResponseDto> {
    // Get mentor profile
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
      relations: ['user'],
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    if (!mentorProfile.isFeatured) {
      throw new BadRequestException('Mentor is not currently featured');
    }

    // Unfeature the mentor
    mentorProfile.isFeatured = false;
    mentorProfile.featuredAt = null;
    mentorProfile.featuredExpiresAt = null;
    mentorProfile.featuredOrder = 0;

    await this.mentorProfileRepository.save(mentorProfile);

    // Create audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: adminId,
        walletAddress: (await this.userRepository.findOne({ where: { id: adminId } }))
          ?.walletAddress,
        eventType: AuditEventType.MENTOR_UNFEATURED,
        ipAddress,
        metadata: {
          mentorId,
          mentorName: mentorProfile.user.displayName,
        },
      }),
    );

    return this.toResponseDto(mentorProfile);
  }

  async updateFeaturedOrder(
    mentorId: string,
    newOrder: number,
    adminId: string,
    ipAddress: string,
  ): Promise<FeaturedMentorResponseDto> {
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
      relations: ['user'],
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    if (!mentorProfile.isFeatured) {
      throw new BadRequestException('Mentor is not currently featured');
    }

    const oldOrder = mentorProfile.featuredOrder;
    mentorProfile.featuredOrder = newOrder;

    await this.mentorProfileRepository.save(mentorProfile);

    // Create audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: adminId,
        walletAddress: (await this.userRepository.findOne({ where: { id: adminId } }))
          ?.walletAddress,
        eventType: AuditEventType.MENTOR_FEATURED,
        ipAddress,
        metadata: {
          mentorId,
          mentorName: mentorProfile.user.displayName,
          action: 'order_updated',
          oldOrder,
          newOrder,
        },
      }),
    );

    return this.toResponseDto(mentorProfile);
  }

  async cleanupExpiredFeaturedMentors(): Promise<number> {
    const now = new Date();

    const expiredMentors = await this.mentorProfileRepository.find({
      where: {
        isFeatured: true,
      },
    });

    let cleanedCount = 0;

    for (const mentor of expiredMentors) {
      if (mentor.featuredExpiresAt && mentor.featuredExpiresAt <= now) {
        mentor.isFeatured = false;
        mentor.featuredAt = null;
        mentor.featuredExpiresAt = null;
        mentor.featuredOrder = 0;

        await this.mentorProfileRepository.save(mentor);
        cleanedCount++;

        // Create audit log for auto-expiry
        await this.auditLogRepository.save(
          this.auditLogRepository.create({
            userId: null,
            walletAddress: mentor.user?.walletAddress || 'system',
            eventType: AuditEventType.MENTOR_UNFEATURED,
            ipAddress: 'system',
            metadata: {
              mentorId: mentor.id,
              reason: 'auto_expiry',
            },
          }),
        );
      }
    }

    return cleanedCount;
  }

  private toResponseDto(mentorProfile: MentorProfile): FeaturedMentorResponseDto {
    return {
      id: mentorProfile.id,
      bio: mentorProfile.bio,
      yearsOfExperience: mentorProfile.yearsOfExperience,
      expertise: mentorProfile.expertise,
      preferredMentoringStyle: mentorProfile.preferredMentoringStyle,
      availabilityHoursPerWeek: mentorProfile.availabilityHoursPerWeek,
      availabilityDetails: mentorProfile.availabilityDetails,
      isFeatured: mentorProfile.isFeatured,
      featuredAt: mentorProfile.featuredAt,
      featuredExpiresAt: mentorProfile.featuredExpiresAt,
      featuredOrder: mentorProfile.featuredOrder,
      createdAt: mentorProfile.createdAt,
      updatedAt: mentorProfile.updatedAt,
      user: mentorProfile.user
        ? {
            id: mentorProfile.user.id,
            displayName: mentorProfile.user.displayName,
            walletAddress: mentorProfile.user.walletAddress,
            avatarUrl: mentorProfile.user.avatarUrl,
            email: mentorProfile.user.email,
          }
        : undefined,
    };
  }
}
