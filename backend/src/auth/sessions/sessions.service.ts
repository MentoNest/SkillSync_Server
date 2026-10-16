import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SESSION_STORE, SessionStore } from './session-store.port';

export interface RevokeAllResult {
  revokedSessions: number;
  tokenVersion: number;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    @Inject('ACCESS_TOKEN_TTL_SECONDS') private readonly accessTtl: number,
  ) {}

  /**
   * Revoke all sessions of a user: bump tokenVersion (which invalidates every
   * access token issued earlier), revoke all refresh tokens, and blacklist the
   * caller's current access token so it stops working immediately.
   */
  async revokeAll(userId: string, currentJti?: string): Promise<RevokeAllResult> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.tokenVersion += 1;
    await this.users.save(user);

    const revokedSessions = await this.store.revokeAllForUser(userId);
    if (currentJti) {
      await this.store.blacklistAccessToken(currentJti, this.accessTtl);
    }
    this.logger.log(`Revoked ${revokedSessions} sessions for user ${userId}`);
    return { revokedSessions, tokenVersion: user.tokenVersion };
  }
}
