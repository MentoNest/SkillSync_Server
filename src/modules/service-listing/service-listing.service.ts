import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ServiceListing, generateSlug } from './entities/service-listing.entity';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { PaginatedServiceListingsDto, ServiceListingQueryDto } from './dto/service-listing-query.dto';

@Injectable()
export class ServiceListingService {
  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
  ) {}

  async create(createServiceListingDto: CreateServiceListingDto, userId: string): Promise<ServiceListing> {
    // Generate slug from title if not provided
    let slug = createServiceListingDto.slug;
    if (!slug) {
      slug = generateSlug(createServiceListingDto.title);
    }

    // Ensure slug uniqueness
    slug = await this.generateUniqueSlug(slug);

    const serviceListing = this.serviceListingRepository.create({
      ...createServiceListingDto,
      slug,
      mentorId: userId,
    });
    return this.serviceListingRepository.save(serviceListing);
  }

  async findAll(query: ServiceListingQueryDto): Promise<PaginatedServiceListingsDto<ServiceListing>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serviceListingRepository
      .createQueryBuilder('listing')
      .where('listing.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('listing.isActive = :isActive', { isActive: true });

    if (query.keyword) {
      qb.andWhere(
        '(listing.title ILIKE :keyword OR listing.description ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    if (query.category) {
      qb.andWhere('listing.category = :category', { category: query.category });
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

  async findOne(id: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    return serviceListing;
  }

  async update(id: string, updateServiceListingDto: UpdateServiceListingDto, userId: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
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
    const { slug: _, ...otherFields } = updateServiceListingDto;
    Object.assign(serviceListing, otherFields);

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

  /**
   * Find a service listing by its slug
   */
  async findBySlug(slug: string): Promise<ServiceListing> {
    const serviceListing = await this.serviceListingRepository.findOne({
      where: { slug, isDeleted: false },
    });

    if (!serviceListing) {
      throw new NotFoundException(`Service listing with slug "${slug}" not found`);
    }

    return serviceListing;
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
