import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing, ListingStatus, ListingType } from '../entities/listing.entity';
import { CreateListingDto } from '../dto/create-listing.dto';
import { UpdateListingDto } from '../dto/update-listing.dto';
import * as crypto from 'crypto';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private listingsRepository: Repository<Listing>,
  ) {}

  /**
   * Generate a content hash for duplicate detection
   */
  private generateContentHash(title: string, description: string, skills: string[]): string {
    const normalizedTitle = (title || '').toLowerCase().trim();
    const normalizedDescription = (description || '').toLowerCase().trim();
    const normalizedSkills = (skills || []).map(s => s.toLowerCase().trim()).sort().join(',');
    
    const content = `${normalizedTitle}|${normalizedDescription}|${normalizedSkills}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate similarity score between two strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein distance algorithm for string comparison
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Check for similar listings based on multiple factors
   */
  private async findSimilarListings(
    userId: string,
    title: string,
    description: string,
    skills: string[],
    type: ListingType,
  ): Promise<{ listing: Listing; score: number }[]> {
    // Get all active listings of the same type (excluding current user's listings)
    const allListings = await this.listingsRepository.find({
      where: {
        status: ListingStatus.ACTIVE,
        type,
      },
      relations: ['user'],
    });

    const similarListings: { listing: Listing; score: number }[] = [];

    for (const listing of allListings) {
      // Skip if same user
      if (listing.userId === userId) continue;

      let similarityScore = 0;

      // Title similarity (weight: 40%)
      const titleSimilarity = this.calculateSimilarity(
        (title || '').toLowerCase(),
        (listing.title || '').toLowerCase(),
      );

      // Description similarity (weight: 40%)
      const descSimilarity = this.calculateSimilarity(
        (description || '').toLowerCase(),
        (listing.description || '').toLowerCase(),
      );

      // Skills overlap (weight: 20%)
      const listingSkills = (listing.skills || []).map(s => s.toLowerCase());
      const inputSkills = (skills || []).map(s => s.toLowerCase());
      const commonSkills = inputSkills.filter(s => listingSkills.includes(s));
      const skillSimilarity = inputSkills.length > 0 
        ? commonSkills.length / inputSkills.length 
        : 0;

      // Calculate weighted score
      similarityScore = (titleSimilarity * 0.4) + (descSimilarity * 0.4) + (skillSimilarity * 0.2);

      // If similarity score is above threshold (0.75), consider it a potential duplicate
      if (similarityScore >= 0.75) {
        similarListings.push({ listing, score: similarityScore });
      }
    }

    // Sort by similarity score (highest first)
    return similarListings.sort((a, b) => b.score - a.score);
  }

  /**
   * Create a new listing with duplicate detection
   */
  async create(createListingDto: CreateListingDto, userId: string): Promise<Listing> {
    const { title, description, skills, type } = createListingDto;

    // Check for duplicate content hash
    const contentHash = this.generateContentHash(title || '', description || '', skills || []);
    
    const existingWithHash = await this.listingsRepository.findOne({
      where: {
        userId,
        contentHash,
        status: ListingStatus.ACTIVE,
      },
    });

    if (existingWithHash) {
      throw new ConflictException('Duplicate listing detected. You already have an active listing with similar content.');
    }

    // Check for similar listings from other users
    const similarListings = await this.findSimilarListings(
      userId,
      title || '',
      description || '',
      skills || [],
      type || ListingType.MENTORSHIP,
    );

    // Create the listing
    const listing = this.listingsRepository.create({
      ...createListingDto,
      userId,
      contentHash,
      status: ListingStatus.ACTIVE,
      isAvailable: createListingDto.isAvailable ?? true,
      type: createListingDto.type || ListingType.MENTORSHIP,
    });

    // If similar listings found, store references but still allow creation
    if (similarListings.length > 0) {
      listing.similarListingIds = similarListings.map(s => s.listing.id);
      listing.similarityScore = similarListings[0].score;
      
      // Mark as potential duplicate if very high similarity (>0.9)
      if (similarListings[0].score > 0.9) {
        // Still create but flag it
        console.warn(`High similarity detected (${similarListings[0].score}) with listing ${similarListings[0].listing.id}`);
      }
    }

    return this.listingsRepository.save(listing);
  }

  /**
   * Find all active listings
   */
  async findAll(filters?: {
    type?: ListingType;
    skills?: string[];
    minRate?: number;
    maxRate?: number;
  }): Promise<Listing[]> {
    const queryBuilder = this.listingsRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.user', 'user')
      .where('listing.status = :status', { status: ListingStatus.ACTIVE })
      .andWhere('listing.isAvailable = :isAvailable', { isAvailable: true });

    if (filters?.type) {
      queryBuilder.andWhere('listing.type = :type', { type: filters.type });
    }

    if (filters?.skills && filters.skills.length > 0) {
      queryBuilder.andWhere('listing.skills && :skills', { skills: filters.skills });
    }

    if (filters?.minRate !== undefined) {
      queryBuilder.andWhere('listing.hourlyRate >= :minRate', { minRate: filters.minRate });
    }

    if (filters?.maxRate !== undefined) {
      queryBuilder.andWhere('listing.hourlyRate <= :maxRate', { maxRate: filters.maxRate });
    }

    return queryBuilder.getMany();
  }

  /**
   * Find one listing by ID
   */
  async findOne(id: string): Promise<Listing> {
    const listing = await this.listingsRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing;
  }

  /**
   * Find listings by user ID
   */
  async findByUserId(userId: string): Promise<Listing[]> {
    return this.listingsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update a listing
   */
  async update(id: string, updateListingDto: UpdateListingDto): Promise<Listing> {
    const listing = await this.findOne(id);

    // If updating sensitive fields, regenerate content hash
    if (updateListingDto.title || updateListingDto.description || updateListingDto.skills) {
      const title = updateListingDto.title || listing.title || '';
      const description = updateListingDto.description || listing.description || '';
      const skills = updateListingDto.skills || listing.skills || [];
      
      const newContentHash = this.generateContentHash(title, description, skills);
      
      if (newContentHash !== listing.contentHash) {
        // Check for duplicates with new content
        const existingWithHash = await this.listingsRepository.findOne({
          where: {
            userId: listing.userId,
            contentHash: newContentHash,
            status: ListingStatus.ACTIVE,
            id: id, // Exclude current listing
          },
        });

        if (existingWithHash) {
          throw new ConflictException('Duplicate listing detected. You already have an active listing with similar content.');
        }

        listing.contentHash = newContentHash;
      }
    }

    Object.assign(listing, updateListingDto);
    return this.listingsRepository.save(listing);
  }

  /**
   * Remove a listing (soft delete by setting status to INACTIVE)
   */
  async remove(id: string): Promise<void> {
    const listing = await this.findOne(id);
    listing.status = ListingStatus.INACTIVE;
    await this.listingsRepository.save(listing);
  }

  /**
   * Flag a listing as duplicate
   */
  async flagAsDuplicate(listingId: string, reason: string): Promise<Listing> {
    const listing = await this.findOne(listingId);
    listing.status = ListingStatus.DUPLICATE;
    await this.listingsRepository.save(listing);
    return listing;
  }

  /**
   * Get duplicate statistics
   */
  async getDuplicateStats(): Promise<{
    totalListings: number;
    activeListings: number;
    duplicateListings: number;
    averageSimilarityScore: number;
  }> {
    const [totalListings, activeListings, duplicateListings] = await Promise.all([
      this.listingsRepository.count(),
      this.listingsRepository.count({ where: { status: ListingStatus.ACTIVE } }),
      this.listingsRepository.count({ where: { status: ListingStatus.DUPLICATE } }),
    ]);

    const listingsWithScore = await this.listingsRepository
      .createQueryBuilder('listing')
      .select(['listing.similarityScore'])
      .where('listing.similarity_score IS NOT NULL')
      .getMany();

    const averageSimilarityScore = listingsWithScore.length > 0
      ? listingsWithScore.reduce((sum, l) => sum + (Number(l.similarityScore) || 0), 0) / listingsWithScore.length
      : 0;

    return {
      totalListings,
      activeListings,
      duplicateListings,
      averageSimilarityScore,
    };
  }
}
