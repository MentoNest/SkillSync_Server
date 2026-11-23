import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ProfileCompletenessService } from '../profile/profile-completeness.service';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { isValidStellarWalletAddress } from '../common/validators/wallet-address';
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
    private readonly completeness: ProfileCompletenessService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const walletAddress = normalizeWalletAddress(dto.walletAddress);
    const existing = await this.users.findOneBy({ walletAddress });
    if (existing) throw new DuplicateResourceException('User with this wallet address already exists.');

    if (dto.email) {
      const emailTaken = await this.users.findOneBy({ email: dto.email.toLowerCase() });
      if (emailTaken) throw new DuplicateResourceException('Email is already in use.');
    }

    const entity = this.users.create({
      walletAddress,
      email: dto.email?.toLowerCase() ?? null,
      username: null,
      displayName: dto.displayName ?? null,
      status: dto.status ?? UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
      education: [],
      certifications: [],
    });
    const saved = await this.users.save(entity);
    return this.toResponseDto(saved);
  }

  async findMe(walletAddress: string): Promise<UserResponseDto> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.findOrCreate(normalizedAddress);
    const userWithMentor = await this.loadMentorProfile(user);
    const score = await this.completeness.getForUser(normalizedAddress);
    return { ...this.toResponseDto(userWithMentor), completenessScore: score.score };
  }

  async findAll(query: QueryUserDto): Promise<{ data: UserResponseDto[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.mentorProfile', 'mentorProfile')
      .where(where);
    if (query.search) {
      qb.andWhere('(u.username ILIKE :q OR u.displayName ILIKE :q)', { q: `%${query.search}%` });
      // Featured mentors are prioritised in search results, then manually ordered.
      qb.addOrderBy('mentorProfile.isFeatured', 'DESC')
        .addOrderBy('mentorProfile.featuredOrder', 'ASC');
    }
    qb.addOrderBy('u.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const data = await Promise.all(
      rows.map(async (u) => ({
        ...this.toResponseDto(u),
        completenessScore: (await this.completeness.getForUser(u.walletAddress)).score,
      })),
    );
    return { data, total, page, limit };
  }

  async updateMe(walletAddress: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.findOrCreate(normalizedAddress);

    if (dto.email !== undefined) {
      const nextEmail = dto.email?.toLowerCase() ?? null;
      if (nextEmail) {
        const existing = await this.users.findOne({ where: { email: nextEmail } });
        if (existing && existing.walletAddress !== normalizedAddress) {
          throw new DuplicateResourceException('Email is already in use.');
        }
      }
      user.email = nextEmail;
    }
    if (dto.displayName !== undefined) user.displayName = dto.displayName ?? null;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;
    if (dto.timezone !== undefined) user.timezone = dto.timezone ?? null;
    if (dto.locale !== undefined) user.locale = dto.locale ?? null;
    if (dto.education !== undefined) user.education = dto.education;
    if (dto.certifications !== undefined) user.certifications = dto.certifications;

    const saved = await this.users.save(user);
    await this.completeness.invalidate(normalizedAddress);
    const score = await this.completeness.getForUser(normalizedAddress);
    return {
      ...this.toResponseDto(await this.loadMentorProfile(saved)),
      completenessScore: score.score,
    };
  }

  async removeMe(walletAddress: string): Promise<void> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.users.findOneBy({ walletAddress: normalizedAddress });
    if (!user) throw new ResourceNotFoundException('User', normalizedAddress);
    user.status = UserStatus.DELETED;
    await this.users.save(user);
    await this.users.softDelete({ walletAddress: normalizedAddress });
    await this.completeness.invalidate(normalizedAddress);
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
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const normalised = desiredUsername.toLowerCase();
    const validation = validateUsername(desiredUsername);
    if (!validation.valid) throw new BusinessRuleException(validation.message ?? 'Invalid username.');

    const user = await this.findOrCreate(normalizedAddress);
    if (user.username !== null && user.usernameChangedAt !== null) {
      const cooldownMs = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const elapsed = Date.now() - user.usernameChangedAt.getTime();
      if (elapsed < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
        throw new BusinessRuleException(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
      }
    }

    const existing = await this.users.findOneBy({ username: normalised });
    if (existing && existing.walletAddress !== normalizedAddress) {
      throw new DuplicateResourceException(`Username "${desiredUsername}" is already taken.`);
    }

    const previous = user.username;
    user.username = normalised;
    user.usernameChangedAt = new Date();
    const saved = await this.users.save(user);
    this.audit.log(`username_changed address=${normalizedAddress} previous=${previous ?? 'none'} new=${normalised}`);
    return saved;
  }

  async setDisplayName(walletAddress: string, displayName: string | null | undefined): Promise<User> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.findOrCreate(normalizedAddress);
    user.displayName = displayName ?? null;
    const saved = await this.users.save(user);
    this.audit.log(`display_name_changed address=${normalizedAddress} value=${displayName ?? 'null'}`);
    return saved;
  }

  async getPublicProfile(identifier: string): Promise<PublicProfileResponseDto> {
    const walletAddress = isValidStellarWalletAddress(identifier)
      ? normalizeWalletAddress(identifier)
      : identifier;
    const user = await this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.mentorProfile', 'mentorProfile')
      .where('u.username = :username OR u.wallet_address = :walletAddress', {
        username: identifier.toLowerCase(),
        walletAddress,
      })
      .getOne();
    if (!user) throw new ResourceNotFoundException('Profile', identifier);

    return await this.toPublicDto(user);
  }

  async findByWallet(walletAddress: string): Promise<User | null> {
    return this.users.findOneBy({ walletAddress: normalizeWalletAddress(walletAddress) });
  }

  async findOrCreate(walletAddress: string): Promise<User> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const existing = await this.users.findOneBy({ walletAddress: normalizedAddress });
    if (existing) return existing;
    const user = this.users.create({
      walletAddress: normalizedAddress,
      email: null,
      username: null,
      displayName: null,
      status: UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
      education: [],
      certifications: [],
    });
    return this.users.save(user);
  }

  async softDelete(walletAddress: string): Promise<void> {
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.users.findOneBy({ walletAddress: normalizedAddress });
    if (!user) throw new ResourceNotFoundException('User', normalizedAddress);
    user.status = UserStatus.DELETED;
    await this.users.save(user);
    await this.users.softDelete({ walletAddress: normalizedAddress });
    await this.completeness.invalidate(normalizedAddress);
  }

  private async toPublicDto(user: User): Promise<PublicProfileResponseDto> {
    return {
      walletAddress: user.walletAddress,
      username: user.username,
      displayName: user.effectiveDisplayName,
      createdAt: user.createdAt.toISOString(),
      portfolioLinks: await this.portfolioLinks.listByWallet(user.walletAddress),
      isFeatured: user.mentorProfile?.isFeatured ?? false,
      featuredBadge: user.mentorProfile?.isFeatured ? 'Featured' : null,
      isVerified: user.mentorProfile?.isVerified ?? false,
      verifiedAt: user.mentorProfile?.verifiedAt?.toISOString() ?? null,
      verifiedBadge: user.mentorProfile?.isVerified ? 'Verified' : null,
    };
  }

  private async loadMentorProfile(user: User): Promise<User> {
    return (
      (await this.users.findOne({
        where: { walletAddress: user.walletAddress },
        relations: { mentorProfile: true },
      })) ?? user
    );
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
      isFeatured: user.mentorProfile?.isFeatured ?? false,
      featuredBadge: user.mentorProfile?.isFeatured ? 'Featured' : null,
      isVerified: user.mentorProfile?.isVerified ?? false,
      verifiedAt: user.mentorProfile?.verifiedAt ?? null,
      verifiedBadge: user.mentorProfile?.isVerified ? 'Verified' : null,
    };
  }
}
