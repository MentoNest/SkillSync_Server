import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { CreateUserDto } from './dto/create-user.dto';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsernameAvailableResponseDto } from './dto/username-available-response.dto';
import { PortfolioLinksService } from './portfolio-links.service';
import { User } from './user.entity';
import { UserStatus } from './user-status.enum';
import { validateUsername } from './username.validator';

export const USERNAME_COOLDOWN_DAYS = 30;

@Injectable()
export class UserService {
  private readonly audit = new Logger('UserAudit');

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly portfolioLinks: PortfolioLinksService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.users.findOneBy({ walletAddress: dto.walletAddress });
    if (existing) throw new DuplicateResourceException('User with this wallet address already exists.');

    if (dto.email) {
      const emailTaken = await this.users.findOneBy({ email: dto.email.toLowerCase() });
      if (emailTaken) throw new DuplicateResourceException('Email is already in use.');
    }

    const entity = this.users.create({
      walletAddress: dto.walletAddress,
      email: dto.email?.toLowerCase() ?? null,
      username: null,
      displayName: dto.displayName ?? null,
      status: dto.status ?? UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
    });
    const saved = await this.users.save(entity);
    return this.toResponseDto(saved);
  }

  async findMe(walletAddress: string): Promise<UserResponseDto> {
    const user = await this.findOrCreate(walletAddress);
    return this.toResponseDto(user);
  }

  async findAll(query: QueryUserDto): Promise<{ data: UserResponseDto[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const qb = this.users.createQueryBuilder('u').where(where);
    if (query.search) {
      qb.andWhere('(u.username ILIKE :q OR u.displayName ILIKE :q)', { q: `%${query.search}%` });
    }
    qb.orderBy('u.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map((u) => this.toResponseDto(u)), total, page, limit };
  }

  async updateMe(walletAddress: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findOrCreate(walletAddress);

    if (dto.email !== undefined) {
      const nextEmail = dto.email?.toLowerCase() ?? null;
      if (nextEmail) {
        const existing = await this.users.findOne({ where: { email: nextEmail } });
        if (existing && existing.walletAddress !== walletAddress) {
          throw new DuplicateResourceException('Email is already in use.');
        }
      }
      user.email = nextEmail;
    }
    if (dto.displayName !== undefined) user.displayName = dto.displayName ?? null;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;
    if (dto.timezone !== undefined) user.timezone = dto.timezone ?? null;
    if (dto.locale !== undefined) user.locale = dto.locale ?? null;

    const saved = await this.users.save(user);
    return this.toResponseDto(saved);
  }

  async removeMe(walletAddress: string): Promise<void> {
    const user = await this.users.findOneBy({ walletAddress });
    if (!user) throw new ResourceNotFoundException('User', walletAddress);
    user.status = UserStatus.DELETED;
    await this.users.save(user);
    await this.users.softDelete({ walletAddress });
  }

  // ─── Existing username/display/profile flows (kept for compatibility) ─────

  async checkAvailability(username: string): Promise<UsernameAvailableResponseDto> {
    const validation = validateUsername(username);
    if (!validation.valid) return { username, available: false, reason: validation.message };
    const taken = await this.users.existsBy({ username: username.toLowerCase() });
    if (taken) return { username, available: false, reason: 'Username is already taken.' };
    return { username, available: true };
  }

  async setUsername(walletAddress: string, desiredUsername: string): Promise<User> {
    const normalised = desiredUsername.toLowerCase();
    const validation = validateUsername(desiredUsername);
    if (!validation.valid) throw new BusinessRuleException(validation.message ?? 'Invalid username.');

    const user = await this.findOrCreate(walletAddress);
    if (user.username !== null && user.usernameChangedAt !== null) {
      const cooldownMs = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const elapsed = Date.now() - user.usernameChangedAt.getTime();
      if (elapsed < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
        throw new BusinessRuleException(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
      }
    }

    const existing = await this.users.findOneBy({ username: normalised });
    if (existing && existing.walletAddress !== walletAddress) {
      throw new DuplicateResourceException(`Username "${desiredUsername}" is already taken.`);
    }

    const previous = user.username;
    user.username = normalised;
    user.usernameChangedAt = new Date();
    const saved = await this.users.save(user);
    this.audit.log(`username_changed address=${walletAddress} previous=${previous ?? 'none'} new=${normalised}`);
    return saved;
  }

  async setDisplayName(walletAddress: string, displayName: string | null | undefined): Promise<User> {
    const user = await this.findOrCreate(walletAddress);
    user.displayName = displayName ?? null;
    const saved = await this.users.save(user);
    this.audit.log(`display_name_changed address=${walletAddress} value=${displayName ?? 'null'}`);
    return saved;
  }

  async getPublicProfile(identifier: string): Promise<PublicProfileResponseDto> {
    const user =
      (await this.users.findOneBy({ username: identifier.toLowerCase() })) ??
      (await this.users.findOneBy({ walletAddress: identifier }));
    if (!user) throw new ResourceNotFoundException('Profile', identifier);

    return await this.toPublicDto(user);
    return this.toPublicDto(user);
  }

  async findByWallet(walletAddress: string): Promise<User | null> {
    return this.users.findOneBy({ walletAddress });
  }

  async findOrCreate(walletAddress: string): Promise<User> {
    const existing = await this.users.findOneBy({ walletAddress });
    if (existing) return existing;
    const user = this.users.create({
      walletAddress,
      email: null,
      username: null,
      displayName: null,
      status: UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
    });
    return this.users.save(user);
  }

  private async toPublicDto(user: User): Promise<PublicProfileResponseDto> {
  async softDelete(walletAddress: string): Promise<void> {
    const user = await this.users.findOneBy({ walletAddress });
    if (!user) throw new ResourceNotFoundException('User', walletAddress);
    user.status = UserStatus.DELETED;
    await this.users.save(user);
    await this.users.softDelete({ walletAddress });
  }

  private toPublicDto(user: User): PublicProfileResponseDto {
    return {
      walletAddress: user.walletAddress,
      username: user.username,
      displayName: user.effectiveDisplayName,
      createdAt: user.createdAt.toISOString(),
      portfolioLinks: await this.portfolioLinks.listByWallet(user.walletAddress),
    };
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      walletAddress: user.walletAddress,
      email: user.email ?? null,
      username: user.username ?? null,
      displayName: user.effectiveDisplayName,
      status: user.status ?? UserStatus.ACTIVE,
      avatarUrl: user.avatarUrl ?? null,
      timezone: user.timezone ?? null,
      locale: user.locale ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt ?? user.createdAt,
    };
  }
}
