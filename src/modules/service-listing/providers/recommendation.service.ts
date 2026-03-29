import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThan } from 'typeorm';
import { ServiceListing } from '../entities/service-listing.entity';
import { UserBehavior, BehaviorType } from '../entities/user-behavior.entity';
import { ListingApprovalStatus } from '../../../common/enums/skill-status.enum';

interface UserProfile {
  viewedListings: string[];
  categories: Map<string, number>;
  mentors: Map<string, number>;
  priceRanges: { min: number; max: number };
  averageRating: number;
}

interface ListingSimilarity {
  listing: ServiceListing;
  score: number;
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
    @InjectRepository(UserBehavior)
    private userBehaviorRepository: Repository<UserBehavior>,
  ) {}

  /**
   * Get personalized recommendations for a user
   * Combines collaborative filtering with content-based filtering
   */
  async getRecommendationsForUser(
    userId: string,
    limit: number = 10,
  ): Promise<ServiceListing[]> {
    try {
      // Build user profile from behavior history
      const userProfile = await this.buildUserProfile(userId);

      if (userProfile.viewedListings.length === 0) {
        // New user - return trending listings
        return this.getTrendingListings(limit);
      }

      // Get candidate listings (not yet viewed)
      const candidateListings = await this.getCandidateListings(
        userId,
        userProfile.viewedListings,
        limit,
      );

      if (candidateListings.length === 0) {
        return this.getTrendingListings(limit);
      }

      // Score each candidate listing
      const scoredListings = candidateListings.map((listing) => ({
        listing,
        score: this.calculateRecommendationScore(listing, userProfile),
      }));

      // Sort by score and return top recommendations
      return scoredListings
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.listing);
    } catch (error) {
      this.logger.error(`Error getting recommendations for user ${userId}:`, error);
      // Fallback to trending
      return this.getTrendingListings(limit);
    }
  }

  /**
   * Build a user profile from their behavior history
   */
  private async buildUserProfile(userId: string): Promise<UserProfile> {
    const behaviors = await this.userBehaviorRepository.find({
      where: { userId },
      relations: ['listing'],
      order: { createdAt: 'DESC' },
      take: 500, // Consider last 500 interactions
    });

    const profile: UserProfile = {
      viewedListings: [],
      categories: new Map(),
      mentors: new Map(),
      priceRanges: { min: Infinity, max: 0 },
      averageRating: 0,
    };

    let totalRatings = 0;
    let ratingCount = 0;

    const seenListings = new Set<string>();

    for (const behavior of behaviors) {
      if (!behavior.listing) continue;

      const listingId = behavior.listing.id;

      // Track viewed listings (deduplicated)
      if (!seenListings.has(listingId)) {
        seenListings.add(listingId);
        profile.viewedListings.push(listingId);
      }

      // Weight behaviors by type (more recent interactions have higher weight)
      const weight = this.getInteractionWeight(behavior.behaviorType, behaviors.indexOf(behavior));

      // Track category preferences
      const categoryCount = profile.categories.get(behavior.listing.category) || 0;
      profile.categories.set(behavior.listing.category, categoryCount + weight);

      // Track mentor preferences
      const mentorCount = profile.mentors.get(behavior.listing.mentorId) || 0;
      profile.mentors.set(behavior.listing.mentorId, mentorCount + weight);

      // Track price ranges
      profile.priceRanges.min = Math.min(profile.priceRanges.min, behavior.listing.price);
      profile.priceRanges.max = Math.max(profile.priceRanges.max, behavior.listing.price);

      // Track average rating
      if (behavior.metadata?.rating) {
        totalRatings += behavior.metadata.rating;
        ratingCount++;
      }
    }

    // Normalize price ranges
    if (profile.priceRanges.min === Infinity) {
      profile.priceRanges = { min: 0, max: 1000 };
    }

    profile.averageRating = ratingCount > 0 ? totalRatings / ratingCount : 3;

    return profile;
  }

  /**
   * Get interaction weight for behavior type
   * More recent interactions (lower index) get higher weight
   */
  private getInteractionWeight(behaviorType: BehaviorType, recencyIndex: number): number {
    const baseWeights: Record<BehaviorType, number> = {
      [BehaviorType.VIEW]: 1,
      [BehaviorType.CLICK]: 2,
      [BehaviorType.BOOKMARK]: 3,
      [BehaviorType.WISHLIST_ADD]: 3,
      [BehaviorType.WISHLIST_REMOVE]: -1,
      [BehaviorType.BOOKING]: 5,
      [BehaviorType.REVIEW]: 4,
    };

    const baseWeight = baseWeights[behaviorType] || 1;
    // Decay weight over time (newer interactions have higher weight)
    const recencyDecay = Math.exp(-0.01 * recencyIndex);
    return baseWeight * recencyDecay;
  }

  /**
   * Get candidate listings that user hasn't interacted with
   */
  private async getCandidateListings(
    userId: string,
    viewedListingIds: string[],
    limit: number,
  ): Promise<ServiceListing[]> {
    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :status', { status: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() });

    // Exclude already viewed listings
    if (viewedListingIds.length > 0) {
      qb.andWhere('listing.id NOT IN (:...viewedIds)', { viewedIds: viewedListingIds });
    }

    // Order by trendingScore to get diverse candidates
    qb.orderBy('listing.trendingScore', 'DESC').take(limit * 3); // Get 3x to have more candidates for scoring

    return qb.getMany();
  }

  /**
   * Calculate recommendation score for a listing based on user profile
   */
  private calculateRecommendationScore(listing: ServiceListing, profile: UserProfile): number {
    let score = 0;

    // 1. Category match (40%)
    const categoryWeight = profile.categories.get(listing.category) || 0;
    const categoryScore = Math.min(categoryWeight / 10, 2); // Cap at 2
    score += categoryScore * 40;

    // 2. Mentor preference (20%)
    const mentorWeight = profile.mentors.get(listing.mentorId) || 0;
    const mentorScore = Math.min(mentorWeight / 5, 1.5); // Cap at 1.5
    score += mentorScore * 20;

    // 3. Price range compatibility (15%)
    const priceCompatibility = this.calculatePriceCompatibility(
      listing.price,
      profile.priceRanges,
    );
    score += priceCompatibility * 15;

    // 4. Rating and quality (15%)
    const qualityScore = (listing.averageRating || 0) / 5; // 0 to 1
    const reviewBoost = Math.min((listing.reviewCount || 0) / 20, 1); // Cap at 1
    score += (qualityScore * 0.7 + reviewBoost * 0.3) * 15;

    // 5. Trending score boost (10%)
    const trendingBoost = Math.min((listing.trendingScore || 0) / 100, 1); // Cap at 1
    score += trendingBoost * 10;

    return score;
  }

  /**
   * Calculate how compatible a price is with user's price range
   * Returns a score from 0 to 1
   */
  private calculatePriceCompatibility(
    price: number,
    priceRange: { min: number; max: number },
  ): number {
    const { min, max } = priceRange;
    const range = max - min || 1;
    const midpoint = (min + max) / 2;

    // Perfect match near midpoint, penalty for extremes
    const distance = Math.abs(price - midpoint);
    const maxDistance = range / 2;

    return Math.max(0, 1 - distance / maxDistance);
  }

  /**
   * Get trending listings as fallback
   */
  private async getTrendingListings(limit: number): Promise<ServiceListing[]> {
    return this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :status', { status: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() })
      .orderBy('listing.trendingScore', 'DESC')
      .addOrderBy('listing.isFeatured', 'DESC')
      .addOrderBy('listing.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Record user behavior
   */
  async recordBehavior(
    userId: string,
    listingId: string,
    behaviorType: BehaviorType,
    metadata?: Record<string, any>,
  ): Promise<UserBehavior> {
    const behavior = this.userBehaviorRepository.create({
      userId,
      listingId,
      behaviorType,
      metadata,
    });

    return this.userBehaviorRepository.save(behavior);
  }

  /**
   * Get similar listings based on a given listing
   * Used for "you might also like" suggestions
   */
  async getSimilarListings(
    listingId: string,
    limit: number = 5,
  ): Promise<ListingSimilarity[]> {
    const sourceListing = await this.serviceListingRepository.findOne({
      where: { id: listingId },
    });

    if (!sourceListing) {
      return [];
    }

    // Get listings with same category
    const similarListings = await this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.id != :sourceId', { sourceId: listingId })
      .andWhere('listing.category = :category', { category: sourceListing.category })
      .andWhere('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :status', { status: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() })
      .orderBy('listing.trendingScore', 'DESC')
      .take(limit)
      .getMany();

    // Score by similarity
    const scored = similarListings.map((listing) => ({
      listing,
      score: this.calculateSimilarityScore(sourceListing, listing),
    }));

    // Sort by score
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Calculate similarity score between two listings
   */
  private calculateSimilarityScore(source: ServiceListing, target: ServiceListing): number {
    let score = 0;

    // Same category (already filtered, so full points)
    score += 40;

    // Same mentor (bonus)
    if (source.mentorId === target.mentorId) {
      score += 20;
    }

    // Similar price (within 20%)
    const priceDifference = Math.abs(source.price - target.price) / source.price;
    if (priceDifference < 0.2) {
      score += 20;
    } else if (priceDifference < 0.5) {
      score += 10;
    }

    // Similar quality (both highly rated or both new)
    const ratingDiff = Math.abs((source.averageRating || 0) - (target.averageRating || 0));
    if (ratingDiff < 1) {
      score += 15;
    }

    // Trending boost
    const targetTrendingNorm = Math.min((target.trendingScore || 0) / 100, 1);
    score += targetTrendingNorm * 10;

    // Featured boost
    if (target.isFeatured) {
      score += 5;
    }

    return score;
  }

  /**
   * Get recommendations based on category for new users
   */
  async getRecommendationsByCategory(
    category: string,
    limit: number = 10,
  ): Promise<ServiceListing[]> {
    return this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.category = :category', { category })
      .andWhere('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :status', { status: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() })
      .orderBy('listing.trendingScore', 'DESC')
      .addOrderBy('listing.averageRating', 'DESC')
      .addOrderBy('listing.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
