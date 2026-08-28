import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, ProfileType, UserStatus } from './entities/user.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { RedisService } from '../auth/services/redis.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PublicUserResponseDto } from './dto/public-user-response.dto';

@Injectable()
export class UserService {
  private static readonly USER_SEARCH_CACHE_TTL_SECONDS = 60; // 1 minute

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    private readonly redisService: RedisService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    if (!createUserDto.walletAddress && !createUserDto.email) {
      throw new BadRequestException('Either walletAddress or email must be provided');
    }

    if (createUserDto.walletAddress) {
      const existingWallet = await this.userRepository.findOne({
        where: { walletAddress: createUserDto.walletAddress.toLowerCase() },
      });
      if (existingWallet) {
        throw new ConflictException('User with this wallet address already exists');
      }
    }

    if (createUserDto.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: createUserDto.email.toLowerCase() },
      });
      if (existingEmail) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Default role assignment
    const defaultRoleName =
      createUserDto.profileType === ProfileType.MENTOR ? 'mentor' : 'mentee';
    const defaultRole = await this.roleRepository.findOne({
      where: { name: defaultRoleName },
    });

    const user = this.userRepository.create({
      ...createUserDto,
      walletAddress: createUserDto.walletAddress?.toLowerCase(),
      email: createUserDto.email?.toLowerCase(),
      roles: defaultRole ? [defaultRole] : [],
      settings: createUserDto.settings || {
        notifications: true,
        theme: 'light',
        emailAlerts: true,
      },
    });

    const savedUser = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(savedUser);
  }

  async findAll(query: UserQueryDto): Promise<{
    data: UserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      // #1174/#1176: this is a public listing endpoint - never surface
      // suspended, deleted, or not-yet-active accounts.
      .where('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE })
      .skip(skip)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');

    if (query.profileType) {
      queryBuilder.andWhere('user.profileType = :profileType', {
        profileType: query.profileType,
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(LOWER(user.displayName) LIKE LOWER(:search) OR LOWER(user.email) LIKE LOWER(:search) OR LOWER(user.walletAddress) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users.map((u) => UserResponseDto.fromEntity(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * #1173: Search users by role with filtering, pagination, sorting and caching.
   * - role filter matches users assigned that role
   * - search performs case-insensitive partial matching on displayName (ILIKE)
   * - skill filter applies to mentor profiles only (skills array contains value)
   * - sortBy: name | createdAt | rating (mentors only, non-mentors sort last)
   * - Common results are cached in Redis for 1 minute (admin views bypass cache)
   */
  async searchUsers(
    query: UserSearchQueryDto,
    isAdmin = false,
  ): Promise<{
    data: PublicUserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 20, 100);
    const skip = (page - 1) * limit;
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Serve common search results from Redis cache (public views only)
    const cacheKey = `users:search:${JSON.stringify({
      role: query.role || null,
      search: query.search || null,
      skill: query.skill || null,
      page,
      limit,
      sortBy: query.sortBy || 'createdAt',
      sortOrder,
    })}`;
    if (!isAdmin) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // Ignore corrupted cache entries and re-query
        }
      }
    }

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // #1174/#1176: this is a public search endpoint - never surface
    // suspended, deleted, or not-yet-active accounts.
    queryBuilder.andWhere('user.status = :status', { status: UserStatus.ACTIVE });

    // Role filter: only users that hold the given role (case-insensitive)
    if (query.role) {
      const roleUserSubQuery = this.roleRepository
        .createQueryBuilder('role')
        .select('roleUser.id')
        .innerJoin('role.users', 'roleUser')
        .where('LOWER(role.name) = LOWER(:role)');
      queryBuilder
        .andWhere(`user.id IN (${roleUserSubQuery.getQuery()})`)
        .setParameter('role', query.role);
    }

    // Skill filter: mentor profiles only (skills array contains the value)
    if (query.skill) {
      const mentorSkillSubQuery = this.mentorProfileRepository
        .createQueryBuilder('mentorProfile')
        .select('mentorProfile.userId')
        .where(':skill = ANY(mentorProfile.skills)');
      queryBuilder
        .andWhere(`user.id IN (${mentorSkillSubQuery.getQuery()})`)
        .setParameter('skill', query.skill);
    }

    // Display name search: case-insensitive partial matching (PostgreSQL ILIKE)
    if (query.search) {
      queryBuilder.andWhere('user.displayName ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    // Sorting
    if (query.sortBy === 'name') {
      queryBuilder.orderBy('user.displayName', sortOrder, 'NULLS LAST');
    } else if (query.sortBy === 'rating') {
      queryBuilder
        .leftJoin(MentorProfile, 'mentorProfile', 'mentorProfile.userId = user.id')
        .orderBy('mentorProfile.averageRating', sortOrder, 'NULLS LAST');
    } else {
      queryBuilder.orderBy('user.createdAt', sortOrder);
    }

    queryBuilder.skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    // Enrich mentor results with skills and average rating
    const userIds = users.map((u) => u.id);
    const mentorProfiles = userIds.length
      ? await this.mentorProfileRepository.find({ where: { userId: In(userIds) } })
      : [];
    const profileByUserId = new Map(mentorProfiles.map((p) => [p.userId, p]));

    const result = {
      data: users.map((u) =>
        PublicUserResponseDto.fromEntity(u, profileByUserId.get(u.id), isAdmin),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    if (!isAdmin) {
      await this.redisService.set(cacheKey, JSON.stringify(result), UserService.USER_SEARCH_CACHE_TTL_SECONDS);
    }

    return result;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async findUserResponseById(id: string): Promise<UserResponseDto> {
    const user = await this.findById(id);
    return UserResponseDto.fromEntity(user);
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
      relations: { roles: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: { roles: true },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findById(id);

    if (updateUserDto.email && updateUserDto.email.toLowerCase() !== user.email) {
      const existing = await this.findByEmail(updateUserDto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email is already taken by another user');
      }
      user.email = updateUserDto.email.toLowerCase();
    }

    if (updateUserDto.displayName !== undefined) {
      user.displayName = updateUserDto.displayName;
    }
    if (updateUserDto.bio !== undefined) {
      user.bio = updateUserDto.bio;
    }
    if (updateUserDto.avatarUrl !== undefined) {
      user.avatarUrl = updateUserDto.avatarUrl;
    }
    if (updateUserDto.profileType !== undefined) {
      user.profileType = updateUserDto.profileType;
    }
    if (updateUserDto.settings !== undefined) {
      user.settings = { ...user.settings, ...updateUserDto.settings };
    }

    const updatedUser = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(updatedUser);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const user = await this.findById(id);
    await this.userRepository.remove(user);
    return {
      success: true,
      message: `User with ID "${id}" successfully deleted`,
    };
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.findById(userId);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);
    return user.tokenVersion;
  }

  async lockAccount(userId: string, durationMinutes: number = 30): Promise<User> {
    const user = await this.findById(userId);
    user.isLocked = true;
    user.lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    return this.userRepository.save(user);
  }

  async unlockAccount(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.isLocked = false;
    user.lockoutUntil = null;
    return this.userRepository.save(user);
  }

  async recordLogin(userId: string, ipAddress?: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress || null,
    });
  }
}
