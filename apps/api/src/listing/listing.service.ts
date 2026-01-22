import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { Skill } from '../skills/entities/skill.entity';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listing.dto';
import {
  ListingResponseDto,
  PaginatedListingsResponseDto,
} from './dto/listing-response.dto';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  async create(
    mentorProfileId: string,
    createListingDto: CreateListingDto,
  ): Promise<ListingResponseDto> {
    const skills = await this.validateSkills(createListingDto.skillIds);

    const listing = this.listingRepository.create({
      mentorProfileId,
      title: createListingDto.title,
      description: createListingDto.description,
      hourlyRateMinorUnits: createListingDto.hourlyRateMinorUnits,
      active: createListingDto.active ?? true,
      skills,
    });

    const savedListing = await this.listingRepository.save(listing);
    return this.toResponseDto(
      await this.findOneWithRelations(savedListing.id),
    );
  }

  async findAll(
    mentorProfileId: string,
  ): Promise<ListingResponseDto[]> {
    const listings = await this.listingRepository.find({
      where: { mentorProfileId },
      relations: ['skills', 'mentorProfile'],
      order: { createdAt: 'DESC' },
    });

    return listings.map((listing) => this.toResponseDto(listing));
  }

  async findOne(
    id: string,
    mentorProfileId: string,
  ): Promise<ListingResponseDto> {
    const listing = await this.findOneWithRelations(id);

    if (listing.mentorProfileId !== mentorProfileId) {
      throw new ForbiddenException(
        'You do not have permission to access this listing',
      );
    }

    return this.toResponseDto(listing);
  }

  async update(
    id: string,
    mentorProfileId: string,
    updateListingDto: UpdateListingDto,
  ): Promise<ListingResponseDto> {
    const listing = await this.findOneWithRelations(id);

    if (listing.mentorProfileId !== mentorProfileId) {
      throw new ForbiddenException(
        'You do not have permission to update this listing',
      );
    }

    if (updateListingDto.skillIds) {
      const skills = await this.validateSkills(updateListingDto.skillIds);
      listing.skills = skills;
    }

    if (updateListingDto.title !== undefined) {
      listing.title = updateListingDto.title;
    }
    if (updateListingDto.description !== undefined) {
      listing.description = updateListingDto.description;
    }
    if (updateListingDto.hourlyRateMinorUnits !== undefined) {
      listing.hourlyRateMinorUnits = updateListingDto.hourlyRateMinorUnits;
    }
    if (updateListingDto.active !== undefined) {
      listing.active = updateListingDto.active;
    }

    await this.listingRepository.save(listing);
    return this.toResponseDto(
      await this.findOneWithRelations(listing.id),
    );
  }

  async remove(id: string, mentorProfileId: string): Promise<void> {
    const listing = await this.findOneWithRelations(id);

    if (listing.mentorProfileId !== mentorProfileId) {
      throw new ForbiddenException(
        'You do not have permission to delete this listing',
      );
    }

    await this.listingRepository.remove(listing);
  }

  async search(
    searchDto: SearchListingsDto,
  ): Promise<PaginatedListingsResponseDto> {
    const page = searchDto.page ?? 1;
    const limit = searchDto.limit ?? 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.skills', 'skill')
      .leftJoinAndSelect('listing.mentorProfile', 'mentorProfile');

    if (searchDto.active !== undefined) {
      queryBuilder.andWhere('listing.active = :active', {
        active: searchDto.active,
      });
    } else {
      queryBuilder.andWhere('listing.active = :active', { active: true });
    }

    if (searchDto.minRate !== undefined) {
      queryBuilder.andWhere(
        'listing.hourly_rate_minor_units >= :minRate',
        { minRate: searchDto.minRate },
      );
    }

    if (searchDto.maxRate !== undefined) {
      queryBuilder.andWhere(
        'listing.hourly_rate_minor_units <= :maxRate',
        { maxRate: searchDto.maxRate },
      );
    }

    if (searchDto.skillIds && searchDto.skillIds.length > 0) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('ls.listing_id')
          .from('listing_skills', 'ls')
          .where('ls.skill_id IN (:...skillIds)', {
            skillIds: searchDto.skillIds,
          })
          .groupBy('ls.listing_id')
          .having('COUNT(DISTINCT ls.skill_id) = :skillCount', {
            skillCount: searchDto.skillIds!.length,
          })
          .getQuery();

        return `listing.id IN ${subQuery}`;
      });
    }

    queryBuilder.orderBy('listing.created_at', 'DESC');

    const [listings, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      items: listings.map((listing) => this.toResponseDto(listing)),
      total,
      page,
      limit,
    };
  }

  private async findOneWithRelations(id: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id },
      relations: ['skills', 'mentorProfile'],
    });

    if (!listing) {
      throw new NotFoundException(`Listing with ID ${id} not found`);
    }

    return listing;
  }

  private async validateSkills(skillIds: string[]): Promise<Skill[]> {
    if (!skillIds || skillIds.length === 0) {
      throw new BadRequestException('At least one skill is required');
    }

    const skills = await this.skillRepository.find({
      where: { id: In(skillIds) },
    });

    if (skills.length !== skillIds.length) {
      throw new BadRequestException('One or more skill IDs are invalid');
    }

    return skills;
  }

  private toResponseDto(listing: Listing): ListingResponseDto {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      hourlyRateMinorUnits: listing.hourlyRateMinorUnits,
      active: listing.active,
      skills: listing.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
      })),
      mentorProfile: {
        id: listing.mentorProfile.id,
        userId: listing.mentorProfile.userId,
      },
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };
  }
}