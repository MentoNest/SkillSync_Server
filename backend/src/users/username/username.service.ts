import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { User } from '../entities/user.entity';

/** 3-30 chars; alphanumeric, underscore/dash allowed but never consecutive. */
export const USERNAME_REGEX = /^(?!.*[_-]{2})[A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9]$/;
export const USERNAME_COOLDOWN_DAYS = 30;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

@Injectable()
export class UsernameService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  isValid(username: string): boolean {
    return typeof username === 'string' && USERNAME_REGEX.test(username);
  }

  async isAvailable(username: string): Promise<boolean> {
    if (!this.isValid(username)) throw new BadRequestException('Invalid username format');
    const existing = await this.users.findOne({ where: { username } });
    return !existing;
  }

  async changeUsername(userId: string, username: string, isAdmin = false): Promise<User> {
    if (!this.isValid(username)) {
      throw new BadRequestException('Username must be 3-30 chars: letters, digits, "_" or "-" (no repeats)');
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.username === username) return user;

    const taken = await this.users.findOne({ where: { username } });
    if (taken && taken.id !== userId) throw new ConflictException('Username already taken');

    if (!isAdmin && user.usernameChangedAt) {
      const nextAllowedAt = user.usernameChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * DAY_MS;
      if (Date.now() < nextAllowedAt) {
        throw new HttpException(
          { message: 'Username was changed too recently', nextAllowedAt: new Date(nextAllowedAt) },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    user.username = username;
    user.usernameChangedAt = new Date();
    if (!user.displayName) user.displayName = this.defaultDisplayName(user.walletAddress);
    await this.users.save(user);

    await this.audit.record({
      event: AuditEvent.USERNAME_CHANGED,
      userId,
      metadata: { username, isAdmin },
    });
    return user;
  }

  /** Display-name fallback derived from the wallet prefix. */
  defaultDisplayName(walletAddress: string): string {
    return `User ${walletAddress.slice(0, 8).toUpperCase()}`;
  }

  /** Resolves a public profile by UUID or username. */
  async resolveProfile(identifier: string): Promise<User | null> {
    return this.users.findOne({ where: UUID_REGEX.test(identifier) ? { id: identifier } : { username: identifier } });
  }
}
