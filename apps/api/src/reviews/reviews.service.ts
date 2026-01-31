import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Review } from './entities/review.entity';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';

import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,

    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createReview(
    reviewerId: string,
    dto: CreateReviewDto,
  ): Promise<Review> {
    const session = await this.sessionRepo.findOne({
      where: { id: dto.sessionId },
      relations: ['mentee', 'mentor'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Rule 1: Session must be completed
    if (session.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Reviews are only allowed after session completion',
      );
    }

    // Rule 2: Reviewer must be the mentee
    if (session.mentee.id !== reviewerId) {
      throw new ForbiddenException(
        'Only the session mentee can submit a review',
      );
    }

    // Rule 3: Reviewee must be the mentor
    const mentor = session.mentor;

    // Rule 4: Prevent duplicate reviews
    const existing = await this.reviewRepo.findOne({
      where: {
        session: { id: session.id },
        reviewer: { id: reviewerId },
      },
    });

    if (existing) {
      throw new ConflictException(
        'You have already reviewed this session',
      );
    }

    const review = this.reviewRepo.create({
      session,
      reviewer: { id: reviewerId } as User,
      reviewee: mentor,
      rating: dto.rating,
      comment: dto.comment,
    });

    const saved = await this.reviewRepo.save(review);

    // Optional hook: update mentor rating
    await this.updateMentorRating(mentor.id);

    return saved;
  }

  private async updateMentorRating(mentorId: string): Promise<void> {
    const { avg } = await this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .where('review.revieweeId = :mentorId', { mentorId })
      .getRawOne<{ avg: string }>();

    await this.userRepo.update(mentorId, {
      averageRating: avg ? Number(avg) : 0,
    });
  }
}
