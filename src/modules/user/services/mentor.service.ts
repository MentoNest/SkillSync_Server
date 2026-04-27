import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { FeaturedMentorsPageDto } from '../dto/featured-mentor.dto';

@Injectable()
export class MentorService {
  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
  ) {}

  async getFeaturedMentors(
    page: number = 1,
    limit: number = 20,
  ): Promise<FeaturedMentorsPageDto> {
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.mentorProfileRepository.count({
      where: { isFeatured: true },
    });

    // Get paginated featured mentors with user relation
    const mentors = await this.mentorProfileRepository.find({
      where: { isFeatured: true },
      relations: ['user'],
      order: { featuredOrder: 'ASC', featuredAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: mentors.map((mentor) => ({
        id: mentor.id,
        bio: mentor.bio,
        yearsOfExperience: mentor.yearsOfExperience,
        expertise: mentor.expertise,
        preferredMentoringStyle: mentor.preferredMentoringStyle,
        availabilityHoursPerWeek: mentor.availabilityHoursPerWeek,
        availabilityDetails: mentor.availabilityDetails,
        isFeatured: mentor.isFeatured,
        featuredAt: mentor.featuredAt,
        featuredExpiresAt: mentor.featuredExpiresAt,
        featuredOrder: mentor.featuredOrder,
        createdAt: mentor.createdAt,
        updatedAt: mentor.updatedAt,
        user: mentor.user
          ? {
              id: mentor.user.id,
              displayName: mentor.user.displayName,
              walletAddress: mentor.user.walletAddress,
              avatarUrl: mentor.user.avatarUrl,
              email: mentor.user.email,
            }
          : undefined,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getMentorById(id: string): Promise<MentorProfile> {
    const mentor = await this.mentorProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    return mentor;
  }

  async searchMentors(
    query: string,
    page: number = 1,
    limit: number = 20,
    prioritizeFeatured: boolean = true,
  ): Promise<FeaturedMentorsPageDto> {
    const skip = (page - 1) * limit;

    let queryBuilder = this.mentorProfileRepository
      .createQueryBuilder('mentor')
      .leftJoinAndSelect('mentor.user', 'user')
      .where(
        '(mentor.bio LIKE :query OR mentor.expertise LIKE :query OR user.displayName LIKE :query)',
        { query: `%${query}%` },
      );

    if (prioritizeFeatured) {
      queryBuilder = queryBuilder.orderBy('mentor.isFeatured', 'DESC').addOrderBy(
        'mentor.featuredOrder',
        'ASC',
      );
    }

    queryBuilder = queryBuilder.orderBy('mentor.createdAt', 'DESC').skip(skip).take(limit);

    const [mentors, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data: mentors.map((mentor) => ({
        id: mentor.id,
        bio: mentor.bio,
        yearsOfExperience: mentor.yearsOfExperience,
        expertise: mentor.expertise,
        preferredMentoringStyle: mentor.preferredMentoringStyle,
        availabilityHoursPerWeek: mentor.availabilityHoursPerWeek,
        availabilityDetails: mentor.availabilityDetails,
        isFeatured: mentor.isFeatured,
        featuredAt: mentor.featuredAt,
        featuredExpiresAt: mentor.featuredExpiresAt,
        featuredOrder: mentor.featuredOrder,
        createdAt: mentor.createdAt,
        updatedAt: mentor.updatedAt,
        user: mentor.user
          ? {
              id: mentor.user.id,
              displayName: mentor.user.displayName,
              walletAddress: mentor.user.walletAddress,
              avatarUrl: mentor.user.avatarUrl,
              email: mentor.user.email,
            }
          : undefined,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
