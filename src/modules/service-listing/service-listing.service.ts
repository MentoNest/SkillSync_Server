import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { ServiceListing, generateSlug } from './entities/service-listing.entity';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { PaginatedServiceListingsDto, ServiceListingQueryDto } from './dto/service-listing-query.dto';
import { TagService } from '../tag/tag.service';
import { FileUploadService } from '../profile/providers/file-upload.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceListingService {
  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
    private tagService: TagService,
    private fileUploadService: FileUploadService,
    private configService: ConfigService,
  ) {}

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
    });

    // Save the listing first
    const savedListing = await this.serviceListingRepository.save(serviceListing);

    // Assign tags if provided
    if (tagSlugs && tagSlugs.length > 0) {
      const tags = await this.tagService.findTagsBySlugs(tagSlugs);
      savedListing.tags = tags;
      await this.serviceListingRepository.save(savedListing);
    }

    return savedListing;
  }

  async findAll(query: ServiceListingQueryDto): Promise<PaginatedServiceListingsDto<ServiceListing>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.tags', 'tag')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true })
      .andWhere('listing.isDraft = :isDraft', { isDraft: false });

    if (query.keyword) {
      qb.andWhere(
        '(listing.title ILIKE :keyword OR listing.description ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
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

    qb.orderBy('listing.isFeatured', 'DESC').addOrderBy('listing.createdAt', 'DESC');
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
    return this.serviceListingRepository.findOne({
      where: { id, isDeleted: false, isDraft: false },
      relations: ['tags'],
    });
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

    return this.serviceListingRepository.save(serviceListing);
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
   * Find a service listing by its slug
   */
  async findBySlug(slug: string): Promise<ServiceListing | null> {
    return this.serviceListingRepository.findOne({
      where: { slug, isDeleted: false, isDraft: false },
      relations: ['tags'],
    });
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
}
