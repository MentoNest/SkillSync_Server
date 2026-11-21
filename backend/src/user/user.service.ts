import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto';
import { UsernameAvailableResponseDto } from './dto/username-available-response.dto';
import { User } from './user.entity';
import { UserStatus } from './user-status.enum';
import { validateUsername } from './username.validator';

/** How many days a user must wait between username changes. */
export const USERNAME_COOLDOWN_DAYS = 30;

@Injectable()
export class UserService {
  private readonly audit = new Logger('UserAudit');

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ─── Availability ────────────────────────────────────────────────────────────

  async checkAvailability(username: string): Promise<UsernameAvailableResponseDto> {
    const validation = validateUsername(username);
    if (!validation.valid) {
      return { username, available: false, reason: validation.message };
    }

    const taken = await this.users.existsBy({ username: username.toLowerCase() });
    if (taken) {
      return { username, available: false, reason: 'Username is already taken.' };
    }

    return { username, available: true };
  }

  // ─── Set / change username ───────────────────────────────────────────────────

  async setUsername(walletAddress: string, desiredUsername: string): Promise<User> {
    const normalised = desiredUsername.toLowerCase();

    const validation = validateUsername(desiredUsername);
    if (!validation.valid) {
      throw new BusinessRuleException(validation.message ?? 'Invalid username.');
    }

    const user = await this.findOrCreate(walletAddress);

    // Cooldown check: skip if this is the very first time a username is being set.
    if (user.username !== null && user.usernameChangedAt !== null) {
      const cooldownMs = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const elapsed = Date.now() - user.usernameChangedAt.getTime();
      if (elapsed < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
        throw new BusinessRuleException(
          `You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
        );
      }
    }

    // Uniqueness: reject if taken by another account.
    const existing = await this.users.findOneBy({ username: normalised });
    if (existing && existing.walletAddress !== walletAddress) {
      throw new DuplicateResourceException(`Username "${desiredUsername}" is already taken.`);
    }

    const previous = user.username;
    user.username = normalised;
    user.usernameChangedAt = new Date();
    const saved = await this.users.save(user);

    this.audit.log(
      `username_changed address=${walletAddress} previous=${previous ?? 'none'} new=${normalised}`,
    );

    return saved;
  }

  // ─── Display name ────────────────────────────────────────────────────────────

  async setDisplayName(walletAddress: string, displayName: string | null | undefined): Promise<User> {
    const user = await this.findOrCreate(walletAddress);
    user.displayName = displayName ?? null;
    const saved = await this.users.save(user);
    this.audit.log(
      `display_name_changed address=${walletAddress} value=${displayName ?? 'null'}`,
    );
    return saved;
  }

  // ─── Profiles ────────────────────────────────────────────────────────────────

  /**
   * Looks up a public profile by wallet address OR by username.
   * Checks username first (since most lookups from /profiles/:username will use it),
   * then falls back to wallet address.
   */
  async getPublicProfile(identifier: string): Promise<PublicProfileResponseDto> {
    const user =
      (await this.users.findOneBy({ username: identifier.toLowerCase() })) ??
      (await this.users.findOneBy({ walletAddress: identifier }));

    if (!user) throw new ResourceNotFoundException('Profile', identifier);

    return this.toPublicDto(user);
  }

  async findByWallet(walletAddress: string): Promise<User | null> {
    return this.users.findOneBy({ walletAddress });
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Returns the existing user row or creates one on the fly.
   * Users are created implicitly on first auth; this ensures the user row exists
   * before the profile service tries to update it.
   */
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
    };
  }
}
