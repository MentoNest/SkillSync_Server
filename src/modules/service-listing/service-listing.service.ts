import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceListing } from './entities/service-listing.entity';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { PaginatedServiceListingsDto, ServiceListingQueryDto } from './dto/service-listing-query.dto';

@Injectable()
export class ServiceListingService {
  constructor(
    @InjectRepository(ServiceListing)
    private serviceListingRepository: Repository<ServiceListing>,
  ) {}

  create(createServiceListingDto: CreateServiceListingDto, userId: string): Promise<ServiceListing> {
    const serviceListing = this.serviceListingRepository.create({
      ...createServiceListingDto,
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

  findOne(id: string): Promise<ServiceListing> {
    return this.serviceListingRepository.findOne({
      where: { id, isDeleted: false },
    });
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

    Object.assign(serviceListing, updateServiceListingDto);
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
}
