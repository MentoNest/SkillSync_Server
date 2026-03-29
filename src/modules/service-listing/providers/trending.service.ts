import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ServiceListing } from '../entities/service-listing.entity';
import { ListingApprovalStatus } from '../../../common/enums/skill-status.enum';

@Injectable()
export class TrendingService {
  private readonly logger = new Logger(TrendingService.name);

  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
  ) {}

  /**
   * Calculate a trending score for a single listing based on activity metrics
   * 
   * Formula:
   * - Engagement Score: (viewCount * 0.1) + (clickCount * 0.2) + (conversionCount * 0.5)
   * - Quality Score: (averageRating * 10) + (reviewCount * 0.5)
   * - Time Decay: Applied based on listing age
   * - Recency Boost: Recent activity gets additional weight
   * 
   * @param listing ServiceListing entity
   * @returns Calculated trending score
   */
  calculateTrendingScore(listing: ServiceListing): number {
    const now = new Date();
    const listingAgeInDays = (now.getTime() - listing.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Base engagement score (weighted)
    const engagementScore =
      (listing.viewCount || 0) * 0.1 +
      (listing.clickCount || 0) * 0.2 +
      (listing.conversionCount || 0) * 0.5;

    // Quality score based on reviews and ratings
    const qualityScore =
      Math.min((listing.averageRating || 0) * 10, 50) + // Cap at 50 points
      Math.min((listing.reviewCount || 0) * 0.5, 25); // Cap at 25 points

    // Time decay factor (older listings get lower scores)
    // Decay formula: exp(-k * age_in_days)
    // Using k=0.1 means listings lose ~10% score per day
    const decayFactor = Math.exp(-0.1 * listingAgeInDays);

    // Recency boost: Track recent activity
    const lastActivityAge = this.getLastActivityAge(listing);
    const recencyBoost = Math.exp(-0.2 * lastActivityAge) * 10; // Boost up to 10 points

    // Featured listings get a boost
    const featuredBoost = (listing.isFeatured || false) ? 50 : 0;

    // Combine all factors
    const baseScore = engagementScore + qualityScore + featuredBoost;
    const finalScore = baseScore * decayFactor + recencyBoost;

    return Math.max(0, Math.round(finalScore * 10000) / 10000); // Round to 4 decimals
  }

  /**
   * Get the age of the most recent activity in days
   * For now, we use the updatedAt field as a proxy
   */
  private getLastActivityAge(listing: ServiceListing): number {
    const now = new Date();
    const lastActivity = listing.updatedAt || listing.createdAt;
    return (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Bulk update trending scores for all active, approved listings
   * This should be called periodically via a cron job
   */
  async updateAllTrendingScores(): Promise<{ updated: number; error: string | null }> {
    try {
      // Get all non-deleted, active, approved listings that haven't expired
      const listings = await this.serviceListingRepository.find({
        where: {
          isDeleted: false,
          isActive: true,
          isDraft: false,
          approvalStatus: ListingApprovalStatus.APPROVED,
        },
      });

      this.logger.debug(`Updating trending scores for ${listings.length} listings`);

      // Calculate new scores
      for (const listing of listings) {
        listing.trendingScore = this.calculateTrendingScore(listing);
      }

      // Batch save (more efficient than individual saves)
      await this.serviceListingRepository.save(listings);

      this.logger.log(`Successfully updated trending scores for ${listings.length} listings`);
      return { updated: listings.length, error: null };
    } catch (error) {
      this.logger.error(`Error updating trending scores: ${error.message}`, error.stack);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Get trending listings with pagination
   */
  async getTrendingListings(
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ listings: ServiceListing[]; total: number }> {
    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :approvalStatus', { approvalStatus: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() })
      .orderBy('listing.trendingScore', 'DESC')
      .addOrderBy('listing.isFeatured', 'DESC')
      .addOrderBy('listing.createdAt', 'DESC');

    qb.skip(offset).take(limit);

    const [listings, total] = await qb.getManyAndCount();

    return { listings, total };
  }
}
