import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(ServiceListing)
    private readonly serviceListingRepository: Repository<ServiceListing>,
  ) {}

  async create(createReviewDto: CreateReviewDto, userId: string): Promise<Review> {
    await this.ensureListingExists(createReviewDto.listingId);

    const existingReview = await this.reviewsRepository.findOne({
      where: {
        listingId: createReviewDto.listingId,
        reviewerId: userId,
      },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this listing');
    }

    const review = this.reviewsRepository.create({
      ...createReviewDto,
      reviewerId: userId,
    });

    const savedReview = await this.reviewsRepository.save(review);
    await this.updateListingRating(createReviewDto.listingId);

    return savedReview;
  }

  findByListing(listingId: string): Promise<Review[]> {
    return this.reviewsRepository.find({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, updateReviewDto: UpdateReviewDto, userId: string): Promise<Review> {
    const review = await this.reviewsRepository.findOne({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewerId !== userId) {
      throw new ForbiddenException('You can only update your own reviews');
    }

    Object.assign(review, updateReviewDto);
    const savedReview = await this.reviewsRepository.save(review);
    await this.updateListingRating(review.listingId);

    return savedReview;
  }

  async remove(id: string, userId: string): Promise<void> {
    const review = await this.reviewsRepository.findOne({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewerId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.reviewsRepository.remove(review);
    await this.updateListingRating(review.listingId);
  }

  private async ensureListingExists(listingId: string): Promise<void> {
    const listing = await this.serviceListingRepository.findOne({
      where: { id: listingId, isDeleted: false },
    });

    if (!listing) {
      throw new NotFoundException('Service listing not found');
    }
  }

  private async updateListingRating(listingId: string): Promise<void> {
    const listing = await this.serviceListingRepository.findOne({
      where: { id: listingId, isDeleted: false },
    });

    if (!listing) {
      return;
    }

    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('COALESCE(AVG(review.rating), 0)', 'avgRating')
      .addSelect('COUNT(review.id)', 'reviewCount')
      .where('review.listingId = :listingId', { listingId })
      .getRawOne<{ avgRating: string; reviewCount: string }>();

    if (result) {
      listing.averageRating = Number.parseFloat(result.avgRating ?? '0');
      listing.reviewCount = Number.parseInt(result.reviewCount ?? '0', 10);
    }

    await this.serviceListingRepository.save(listing);
  }
}
