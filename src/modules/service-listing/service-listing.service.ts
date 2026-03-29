import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { ServiceListing, generateSlug } from './entities/service-listing.entity';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { PaginatedServiceListingsDto, ServiceListingQueryDto, ServiceListingSort, SortOrder } from './dto/service-listing-query.dto';
import { TagService } from '../tag/tag.service';
import { FileUploadService } from '../profile/providers/file-upload.service';
import { ConfigService } from '@nestjs/config';
import { ListingApprovalStatus } from '../../common/enums/skill-status.enum';
import { CurrencyCode } from '../../common/enums/currency-code.enum';
import { NotificationService } from '../notification/providers/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { TrendingService } from './providers/trending.service';
import { RecommendationService } from './providers/recommendation.service';
import { UserBehavior, BehaviorType } from './entities/user-behavior.entity';

@Injectable()
export class ServiceListingService {
  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
    @InjectRepository(UserBehavior)
    private userBehaviorRepository: Repository<UserBehavior>,
    private tagService: TagService,
    private fileUploadService: FileUploadService,
    private configService: ConfigService,
    private notificationService: NotificationService,
    private trendingService: TrendingService,
    private recommendationService: RecommendationService,
  ) {}

  private readonly logger = new Logger(ServiceListingService.name);

  async create(createServiceListingDto: CreateServiceListingDto, userId: string): Promise<ServiceListing> {
    // Generate slug from title if not provided
    let slug = createServiceListingDto.slug;
    if (!slug) {
      slug = generateSlug(createServiceListingDto.title);
    }

    // Ensure slug uniqueness
    slug = await this.generateUniqueSlug(slug);

    const { tags: tagSlugs, ...listingData } = createServiceListingDto;

    const serviceListing = this.serviceListingRepository.create({
      ...listingData,
      slug,
      mentorId: userId,
      currency: createServiceListingDto.currency ?? CurrencyCode.USD,
    });

    // Save the listing first
    const savedListing = await this.serviceListingRepository.save(serviceListing);

    // Assign tags if provided
    if (tagSlugs && tagSlugs.length > 0) {
      const tags = await this.tagService.findTagsBySlugs(tagSlugs);
      savedListing.tags = tags;
      await this.serviceListingRepository.save(savedListing);
    }

    await this.notificationService.createForAdmins(
      NotificationType.LISTING_CREATED,
      'New listing submitted',
      `A new listing "${savedListing.title}" is awaiting review.`,
      {
        listingId: savedListing.id,
        mentorId: savedListing.mentorId,
        slug: savedListing.slug,
      },
    );

    return savedListing;
  }

  async createBulk(createServiceListingDtos: CreateServiceListingDto[], userId: string): Promise<ServiceListing[]> {
    if (!Array.isArray(createServiceListingDtos) || createServiceListingDtos.length === 0) {
      throw new BadRequestException('Listing array must be provided and contain at least one item');
    }

    const createdListings: ServiceListing[] = [];

    for (const createServiceListingDto of createServiceListingDtos) {
      const created = await this.create(createServiceListingDto, userId);
      createdListings.push(created);
    }

    return createdListings;
  }

  async findAll(query: ServiceListingQueryDto): Promise<PaginatedServiceListingsDto<ServiceListing>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :approvalStatus', { approvalStatus: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() });

    let hasFullTextSearch = false;

    if (query.keyword) {
      // Use PostgreSQL full-text search for better relevance
      // Normalize the search query for tsquery
      const searchQuery = query.keyword
        .trim()
        .split(/\s+/)
        .map(word => word + ':*') // Add prefix matching
        .join(' & '); // AND operator between terms

      qb.andWhere(
        'listing.search_vector @@ plainto_tsquery(:searchQuery)',
        { searchQuery: query.keyword },
      );

      // Add ranking for better relevance ordering
      qb.addSelect(
        'ts_rank(listing.search_vector, plainto_tsquery(:searchQuery))',
        'relevance',
      );

      hasFullTextSearch = true;
    }

    if (query.category) {
      qb.andWhere('listing.category = :category', { category: query.category });
    }

    if (query.tags && query.tags.length > 0) {
      qb.innerJoin('listing.tags', 'filter_tag')
        .andWhere('filter_tag.slug IN (:...tags)', { tags: query.tags });
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('listing.price >= :minPrice', { minPrice: query.minPrice });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('listing.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    if (query.minDuration !== undefined) {
      qb.andWhere('listing.duration >= :minDuration', { minDuration: query.minDuration });
    }

    if (query.maxDuration !== undefined) {
      qb.andWhere('listing.duration <= :maxDuration', { maxDuration: query.maxDuration });
    }

    if (query.currency) {
      qb.andWhere('listing.currency = :currency', { currency: query.currency });
    }

    // Sorting
    const sortBy = query.sortBy || ServiceListingSort.RELEVANCE;
    const sortOrder = query.sortOrder || SortOrder.DESC;

    // If we have a full-text search, prioritize relevance
    if (hasFullTextSearch && sortBy === ServiceListingSort.RELEVANCE) {
      qb.orderBy('relevance', 'DESC');
      qb.addOrderBy('listing.isFeatured', 'DESC');
      qb.addOrderBy('listing.createdAt', 'DESC');
    } else {
      switch (sortBy) {
        case ServiceListingSort.PRICE:
          qb.orderBy('listing.price', sortOrder);
          break;
        case ServiceListingSort.RATING:
          qb.orderBy('listing.averageRating', sortOrder);
          break;
        case ServiceListingSort.NEWEST:
          qb.orderBy('listing.createdAt', sortOrder);
          break;
        case ServiceListingSort.RELEVANCE:
        default:
          // Featured first, then newest
          qb.orderBy('listing.isFeatured', 'DESC').addOrderBy('listing.createdAt', 'DESC');
          break;
      }
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ServiceListing | null> {
    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.id = :id', { id })
      .andWhere('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() });

    return qb.getOne();
  }

  async findOneWithReviews(id: string): Promise<ServiceListing | null> {
    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .leftJoinAndSelect('listing.reviews', 'review', 'review.listingId = listing.id')
      .where('listing.id = :id', { id })
      .andWhere('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() })
      .orderBy('review.createdAt', 'DESC');

    return qb.getOne();
  }

  async getById(id: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
      relations: ['tags'],
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    return serviceListing;
  }

  async update(id: string, updateServiceListingDto: UpdateServiceListingDto, userId: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
      relations: ['tags'],
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    if (serviceListing.mentorId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    // Handle slug update with uniqueness check
    if (updateServiceListingDto.title !== undefined || updateServiceListingDto.slug !== undefined) {
      serviceListing.slug = await this.updateSlugIfNeeded(
        serviceListing,
        updateServiceListingDto.title,
        updateServiceListingDto.slug,
      );
    }

    // Update other fields
    const { slug: _, tags: tagSlugs, ...otherFields } = updateServiceListingDto;
    Object.assign(serviceListing, otherFields);

    // Update tags if provided
    if (tagSlugs !== undefined) {
      if (tagSlugs.length === 0) {
        serviceListing.tags = [];
      } else {
        const tags = await this.tagService.findTagsBySlugs(tagSlugs);
        serviceListing.tags = tags;
      }
    }

    const updatedListing = await this.serviceListingRepository.save(serviceListing);

    await this.notificationService.createForAdmins(
      NotificationType.LISTING_UPDATED,
      'Listing updated',
      `Listing "${updatedListing.title}" was updated and may require re-review.`,
      {
        listingId: updatedListing.id,
        mentorId: updatedListing.mentorId,
        slug: updatedListing.slug,
      },
    );

    return updatedListing;
  }

  async remove(id: string, userId: string): Promise<void> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    if (serviceListing.mentorId !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    // Soft delete
    serviceListing.isDeleted = true;
    await this.serviceListingRepository.save(serviceListing);
  }

  async adminUpdate(id: string, updateServiceListingDto: UpdateServiceListingDto): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
      relations: ['tags'],
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    // Admin can update any listing without ownership check

    // Handle slug update with uniqueness check
    if (updateServiceListingDto.title !== undefined || updateServiceListingDto.slug !== undefined) {
      serviceListing.slug = await this.updateSlugIfNeeded(
        serviceListing,
        updateServiceListingDto.title,
        updateServiceListingDto.slug,
      );
    }

    // Update other fields
    const { slug: _, tags: tagSlugs, ...otherFields } = updateServiceListingDto;
    Object.assign(serviceListing, otherFields);

    // Update tags if provided
    if (tagSlugs !== undefined) {
      if (tagSlugs.length === 0) {
        serviceListing.tags = [];
      } else {
        const tags = await this.tagService.findTagsBySlugs(tagSlugs);
        serviceListing.tags = tags;
      }
    }

    const updatedListing = await this.serviceListingRepository.save(serviceListing);

    await this.notificationService.createForUser(
      updatedListing.mentorId,
      status === ListingApprovalStatus.APPROVED
        ? NotificationType.LISTING_APPROVED
        : NotificationType.LISTING_REJECTED,
      status === ListingApprovalStatus.APPROVED ? 'Listing approved' : 'Listing rejected',
      status === ListingApprovalStatus.APPROVED
        ? `Your listing "${updatedListing.title}" is now live.`
        : `Your listing "${updatedListing.title}" was rejected.${updatedListing.rejectionReason ? ` Reason: ${updatedListing.rejectionReason}` : ''}`,
      {
        listingId: updatedListing.id,
        approvalStatus: updatedListing.approvalStatus,
        rejectionReason: updatedListing.rejectionReason,
      },
    );

    return updatedListing;
  }

  async adminRemove(id: string): Promise<void> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    // Admin can delete any listing without ownership check
    // Soft delete
    serviceListing.isDeleted = true;
    await this.serviceListingRepository.save(serviceListing);
  }

  async removeBulk(ids: string[], userId: string): Promise<{ deleted: number; notFound: number; unauthorized: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array must be provided and contain at least one item');
    }

    const serviceListings = await this.serviceListingRepository.find({
      where: { id: In(ids), isDeleted: false },
    });

    if (serviceListings.length === 0) {
      throw new NotFoundException('No listings found for deletion');
    }

    const notFound = ids.length - serviceListings.length;
    let unauthorized = 0;
    const listingsToDelete: ServiceListing[] = [];

    // Check ownership for each listing
    for (const listing of serviceListings) {
      if (listing.mentorId !== userId) {
        unauthorized++;
      } else {
        listingsToDelete.push(listing);
      }
    }

    // If no listings can be deleted due to authorization, throw error
    if (listingsToDelete.length === 0) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    // Soft delete all authorized listings
    for (const listing of listingsToDelete) {
      listing.isDeleted = true;
    }

    await this.serviceListingRepository.save(listingsToDelete);

    return {
      deleted: listingsToDelete.length,
      notFound,
      unauthorized,
    };
  }

  async adminRemoveBulk(ids: string[]): Promise<{ deleted: number; notFound: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array must be provided and contain at least one item');
    }

    const serviceListings = await this.serviceListingRepository.find({
      where: { id: In(ids), isDeleted: false },
    });

    if (serviceListings.length === 0) {
      throw new NotFoundException('No listings found for deletion');
    }

    const notFound = ids.length - serviceListings.length;

    // Soft delete all listings
    for (const listing of serviceListings) {
      listing.isDeleted = true;
    }

    await this.serviceListingRepository.save(serviceListings);

    return {
      deleted: serviceListings.length,
      notFound,
    };
  }

  async toggleFeatured(id: string, isFeatured: boolean): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    serviceListing.isFeatured = isFeatured;
    return this.serviceListingRepository.save(serviceListing);
  }

  async toggleVisibility(id: string, isActive: boolean, userId: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    if (serviceListing.mentorId !== userId) {
      throw new ForbiddenException('You can only change visibility for your own listings');
    }

    serviceListing.isActive = isActive;
    return this.serviceListingRepository.save(serviceListing);
  }

  async toggleDraft(id: string, isDraft: boolean, userId: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    if (serviceListing.mentorId !== userId) {
      throw new ForbiddenException('You can only change draft status for your own listings');
    }

    serviceListing.isDraft = isDraft;
    
    // If setting to draft, also set to inactive
    if (isDraft) {
      serviceListing.isActive = false;
    }
    
    return this.serviceListingRepository.save(serviceListing);
  }

  async uploadImage(id: string, file: Express.Multer.File): Promise<string> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    // Save file and get URL
    const imageUrl = await this.fileUploadService.saveFile(file, 'listing-images');
    
    // Update listing with new image URL
    serviceListing.imageUrl = imageUrl;
    await this.serviceListingRepository.save(serviceListing);
    
    return imageUrl;
  }

  getFileUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}${filename}`;
  }

  /**
   * Approve or reject a listing (Admin only)
   */
  async approveListing(id: string, status: ListingApprovalStatus, rejectionReason?: string, adminId?: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    serviceListing.approvalStatus = status;
    
    if (status === ListingApprovalStatus.APPROVED) {
      serviceListing.isActive = true;
      serviceListing.isDraft = false;
    } else if (status === ListingApprovalStatus.REJECTED) {
      serviceListing.isActive = false;
      if (rejectionReason) {
        serviceListing.rejectionReason = rejectionReason;
      }
    }

    if (adminId) {
      serviceListing.approvedBy = adminId;
      serviceListing.approvedAt = new Date();
    }

    return this.serviceListingRepository.save(serviceListing);
  }

  /**
   * Get all pending listings (Admin only)
   */
  async findPendingListings(query: ServiceListingQueryDto): Promise<PaginatedServiceListingsDto<ServiceListing>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.approvalStatus = :status', { status: ListingApprovalStatus.PENDING });

    if (query.keyword) {
      // Use PostgreSQL full-text search
      qb.andWhere(
        'listing.search_vector @@ plainto_tsquery(:searchQuery)',
        { searchQuery: query.keyword },
      );

      // Add ranking for relevance
      qb.addSelect(
        'ts_rank(listing.search_vector, plainto_tsquery(:searchQuery))',
        'relevance',
      );
    }

    if (query.category) {
      qb.andWhere('listing.category = :category', { category: query.category });
    }

    if (query.currency) {
      qb.andWhere('listing.currency = :currency', { currency: query.currency });
    }

    // Order by created date (newest first for pending review)
    qb.orderBy('listing.createdAt', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all listings for admin management
   */
  async findAllForAdmin(query: ServiceListingQueryDto): Promise<PaginatedServiceListingsDto<ServiceListing>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false });

    if (query.keyword) {
      // Use PostgreSQL full-text search
      qb.andWhere(
        'listing.search_vector @@ plainto_tsquery(:searchQuery)',
        { searchQuery: query.keyword },
      );

      // Add ranking for relevance
      qb.addSelect(
        'ts_rank(listing.search_vector, plainto_tsquery(:searchQuery))',
        'relevance',
      );
    }

    if (query.category) {
      qb.andWhere('listing.category = :category', { category: query.category });
    }

    if (query.currency) {
      qb.andWhere('listing.currency = :currency', { currency: query.currency });
    }

    // Filter by approval status if provided
    // @ts-ignore
    if (query.approvalStatus) {
      // @ts-ignore
      qb.andWhere('listing.approvalStatus = :approvalStatus', { approvalStatus: query.approvalStatus });
    }

    qb.orderBy('listing.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  /**
   * Increment view count for a listing
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.serviceListingRepository.increment({ id }, 'viewCount', 1);
  }

  /**
   * Increment click count for a listing
   */
  async incrementClickCount(id: string): Promise<void> {
    await this.serviceListingRepository.increment({ id }, 'clickCount', 1);
  }

  /**
   * Increment conversion count for a listing
   */
  async incrementConversionCount(id: string): Promise<void> {
    await this.serviceListingRepository.increment({ id }, 'conversionCount', 1);
  }

  /**
   * Get analytics for a specific listing
   */
  async getListingAnalytics(id: string): Promise<{ viewCount: number; clickCount: number; conversionCount: number }> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    return {
      viewCount: serviceListing.viewCount,
      clickCount: serviceListing.clickCount,
      conversionCount: serviceListing.conversionCount,
    };
  }

  /**
   * Find a service listing by its slug
   */
   async findBySlug(slug: string): Promise<ServiceListing | null> {
    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.slug = :slug', { slug })
      .andWhere('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false })
      .andWhere('listing.approvalStatus = :approvalStatus', { approvalStatus: ListingApprovalStatus.APPROVED })
      .andWhere('(listing.expiresAt IS NULL OR listing.expiresAt > :now)', { now: new Date() });

    return qb.getOne();
  }

  /**
   * Generate a unique slug by appending a number if needed
   */
  private async generateUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Check if a slug already exists (optionally excluding a specific ID)
   */
  private async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const existing = await this.serviceListingRepository.findOne({
      where: {
        slug,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });

    return !!existing;
  }

  /**
   * Cron job that runs every hour to automatically expire listings
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleListingExpiry() {
    this.logger.log('Running automated listing expiry check...');
    
    const now = new Date();
    
    // Efficiently update all relevant listings in one go
    const result = await this.serviceListingRepository
      .createQueryBuilder()
      .update(ServiceListing)
      .set({ isActive: false })
      .where('isActive = :isActive', { isActive: true })
      .andWhere('isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt <= :now', { now })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} listings automatically.`);
    }
  }

  /**
   * Update slug when title changes, ensuring uniqueness
   */
  private async updateSlugIfNeeded(
    currentListing: ServiceListing,
    newTitle?: string,
    newSlug?: string,
  ): Promise<string> {
    // If slug is explicitly provided, use it (after ensuring uniqueness)
    if (newSlug !== undefined) {
      return this.generateUniqueSlug(newSlug, currentListing.id);
    }

    // If title changes and no explicit slug, regenerate from title
    if (newTitle && newTitle !== currentListing.title) {
      const baseSlug = generateSlug(newTitle);
      return this.generateUniqueSlug(baseSlug, currentListing.id);
    }

    // Keep existing slug
    return currentListing.slug;
  }

  /**
   * Cron job that runs every 15 minutes to update trending scores dynamically
   */
  @Cron('0 */15 * * * *') // Every 15 minutes
  async handleTrendingScoresUpdate() {
    this.logger.debug('Running automated trending scores update...');
    const result = await this.trendingService.updateAllTrendingScores();
    
    if (result.error) {
      this.logger.error(`Error updating trending scores: ${result.error}`);
    } else {
      this.logger.debug(`Updated trending scores for ${result.updated} listings`);
    }
  }

  /**
   * Get trending listings with pagination
   */
  async getTrending(limit: number = 20, offset: number = 0): Promise<{ listings: ServiceListing[]; total: number }> {
    return this.trendingService.getTrendingListings(limit, offset);
  }

  /**
   * Record user behavior for recommendation system
   */
  async recordUserBehavior(
    userId: string,
    listingId: string,
    behaviorType: BehaviorType,
    metadata?: Record<string, any>,
  ): Promise<UserBehavior> {
    return this.recommendationService.recordBehavior(userId, listingId, behaviorType, metadata);
  }

  /**
   * Get personalized recommendations for a user
   */
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10,
  ): Promise<ServiceListing[]> {
    return this.recommendationService.getRecommendationsForUser(userId, limit);
  }

  /**
   * Get similar listings based on a given listing
   */
  async getSimilarListings(listingId: string, limit: number = 5): Promise<ServiceListing[]> {
    const results = await this.recommendationService.getSimilarListings(listingId, limit);
    return results.map((item) => item.listing);
  }

  /**
   * Get recommendations by category
   */
  async getRecommendationsByCategory(category: string, limit: number = 10): Promise<ServiceListing[]> {
    return this.recommendationService.getRecommendationsByCategory(category, limit);
  }
}
