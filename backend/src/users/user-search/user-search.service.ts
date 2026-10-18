import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';
import { REDIS } from '../../redis/redis.module';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User, UserStatus } from '../entities/user.entity';
import { SortOrder, UserSearchQueryDto, UserSortBy } from './dto/user-search-query.dto';

export const SEARCH_CACHE_TTL_SECONDS = 60;
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PublicMentorProfile {
  isVerified: boolean;
  isFeatured: boolean;
  skills: string[];
  expertiseAreas: string[];
  averageRating: number;
  reviewCount: number;
  hourlyRate: number;
}

export interface PublicUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  roles: string[];
  mentorProfile: PublicMentorProfile | null;
}

export interface PagedUsers {
  data: PublicUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Role/skill/name search across public profiles (#1453). */
@Injectable()
export class UserSearchService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async search(query: UserSearchQueryDto): Promise<PagedUsers> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const sortBy = query.sortBy ?? UserSortBy.CREATED_AT;
    const sortOrder = (query.sortOrder ?? SortOrder.DESC) === SortOrder.ASC ? 'ASC' : 'DESC';

    const key = this.cacheKey({ ...query, page, limit, sortBy, sortOrder });
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as PagedUsers;

    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('user.mentorProfile', 'mentor')
      .where('user.deletedAt IS NULL')
      .andWhere('user.status = :active', { active: UserStatus.ACTIVE });

    if (query.role) qb.andWhere('role.name = :role', { role: query.role });
    if (query.search) qb.andWhere('user.displayName ILIKE :search', { search: `%${query.search}%` });
    if (query.skill) qb.andWhere(':skill = ANY(mentor.skills)', { skill: query.skill });

    const sortColumn =
      sortBy === UserSortBy.NAME
        ? 'user.displayName'
        : sortBy === UserSortBy.RATING
          ? 'mentor.averageRating'
          : 'user.createdAt';

    // Featured mentors surface ahead of the rest regardless of sort column
    // (#1459), then the admin-managed order, then the requested sort.
    qb.orderBy('mentor.isFeatured', 'DESC', 'NULLS LAST')
      .addOrderBy('mentor.featuredOrder', 'ASC', 'NULLS LAST')
      .addOrderBy(sortColumn, sortOrder)
      .addOrderBy('user.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const result: PagedUsers = {
      data: rows.map((user) => this.toPublicUser(user)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };

    await this.redis.set(key, JSON.stringify(result), 'EX', SEARCH_CACHE_TTL_SECONDS);
    return result;
  }

  private cacheKey(query: Partial<UserSearchQueryDto>): string {
    const parts = [
      `role=${query.role ?? ''}`,
      `search=${(query.search ?? '').toLowerCase()}`,
      `skill=${(query.skill ?? '').toLowerCase()}`,
      `page=${query.page ?? DEFAULT_PAGE}`,
      `limit=${query.limit ?? DEFAULT_LIMIT}`,
      `sortBy=${query.sortBy ?? UserSortBy.CREATED_AT}`,
      `sortOrder=${query.sortOrder ?? SortOrder.DESC}`,
    ];
    return `users:search:${parts.join('&')}`;
  }

  private toPublicUser(user: User): PublicUser {
    const profile = user.mentorProfile;
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      roles: (user.roles ?? []).map((role) => role.name),
      mentorProfile: profile
        ? {
            isVerified: profile.isVerified,
            // Surfaced so discovery cards can render the "Featured" badge (#1459).
            isFeatured: profile.isFeatured === true,
            skills: profile.skills ?? [],
            expertiseAreas: profile.expertiseAreas ?? [],
            averageRating: Number(profile.averageRating),
            reviewCount: profile.reviewCount,
            hourlyRate: Number(profile.hourlyRate),
          }
        : null,
    };
  }
}
