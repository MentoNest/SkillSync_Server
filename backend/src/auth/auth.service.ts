import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { randomBytes, randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { UserSuspension } from '../admin/entities/user-suspension.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import {
  InvalidCredentialsException,
  TokenExpiredException,
} from '../common/errors/app-exceptions';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { RedisNamespace } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.entity';
import { UserStatus } from '../user/user-status.enum';
import { AUTH_CONFIG, Role } from './auth.types';
import type { AuthConfig, AuthUser, JwtPayload, TokenPair } from './auth.types';

export function loginMessage(address: string, nonce: string): string {
  return `SkillSync login\nAddress: ${normalizeWalletAddress(address)}\nNonce: ${nonce}`;
}

@Injectable()
export class AuthService {
  private readonly audit = new Logger('AuthAudit');

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Optional()
    @InjectRepository(UserSuspension)
    private readonly suspensions?: Repository<UserSuspension>,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /** Issues a single-use nonce for the wallet and the exact message it must sign. */
  async createNonce(
    address: string,
  ): Promise<{ nonce: string; message: string; expiresIn: number }> {
    const normalizedAddress = normalizeWalletAddress(address);
    const { nonce } = await this.issueNonce(normalizedAddress);
    return {
      nonce,
      message: loginMessage(normalizedAddress, nonce),
      expiresIn: this.config.nonceTtlSeconds,
    };
  }

  /** Issues a nonce with its absolute expiry for the path-based nonce endpoint. */
  async createNonceWithExpiry(
    address: string,
  ): Promise<{ nonce: string; expiresAt: string }> {
    const { nonce, expiresAt } = await this.issueNonce(address);
    return { nonce, expiresAt };
  }

  /**
   * Verifies the signature over the stored nonce. The nonce is consumed whether or not
   * the signature is valid, so it cannot be replayed or brute-forced.
   */
  async verifyWallet(address: string, signature: string): Promise<AuthUser> {
    const normalizedAddress = normalizeWalletAddress(address);
    const key = `nonce:${normalizedAddress}`;
    const nonce = await this.redis.get(RedisNamespace.SESSION, key);
    if (!nonce) {
      this.audit.warn(
        `login_failed address=${normalizedAddress} reason=no_nonce`,
      );
      throw new InvalidCredentialsException(
        'No active nonce for this address; request a new one',
      );
    }
    await this.redis.del(RedisNamespace.SESSION, key);

    let valid = false;
    try {
      valid = Keypair.fromPublicKey(normalizedAddress.toUpperCase()).verify(
        Buffer.from(loginMessage(normalizedAddress, nonce), 'utf8'),
        Buffer.from(signature, 'base64'),
      );
    } catch {
      valid = false;
    }
    if (!valid) {
      this.audit.warn(
        `login_failed address=${normalizedAddress} reason=bad_signature`,
      );
      throw new InvalidCredentialsException('Signature verification failed');
    }
    const status = await this.resolveLoginStatus(normalizedAddress);
    return {
      address: normalizedAddress,
      roles: this.rolesFor(normalizedAddress),
      status,
      jti: '',
    };
  }

  async login(address: string, signature: string): Promise<TokenPair> {
    return this.issueForUser(await this.verifyWallet(address, signature));
  }

  /** Issues tokens for a wallet that has already been verified (e.g. by the wallet guard). */
  async issueForUser(user: AuthUser): Promise<TokenPair> {
    const address = normalizeWalletAddress(user.address);
    const status = await this.resolveLoginStatus(address);
    const tokens = await this.issueTokens(
      address,
      user.roles,
      status,
      await this.tokenVersionFor(address),
    );
    this.audit.log(`login_succeeded address=${address}`);
    return tokens;
  }

  /** Rotates the refresh token: the presented one stops working. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.jwtSecret,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError')
        throw new TokenExpiredException();
      throw new InvalidCredentialsException('Invalid refresh token');
    }
    if (payload.type !== 'refresh')
      throw new InvalidCredentialsException('Invalid refresh token');
    if (!(await this.isTokenVersionCurrent(payload.sub, payload.ver))) {
      throw new InvalidCredentialsException('Refresh token is no longer valid');
    }
    const status = await this.resolveLoginStatus(
      normalizeWalletAddress(payload.sub),
    );

    const stored = await this.redis.get(
      RedisNamespace.SESSION,
      `refresh:${payload.jti}`,
    );
    if (stored !== payload.sub) {
      this.audit.warn(
        `refresh_rejected address=${payload.sub} reason=unknown_or_used`,
      );
      throw new InvalidCredentialsException('Refresh token is no longer valid');
    }
    await this.redis.del(RedisNamespace.SESSION, `refresh:${payload.jti}`);
    const tokens = await this.issueTokens(
      payload.sub,
      this.rolesFor(payload.sub),
      status,
      payload.ver ?? 0,
    );
    this.audit.log(`token_refreshed address=${payload.sub}`);
    return tokens;
  }

  /** Revokes the current access token and the session's refresh token. */
  async logout(user: AuthUser, refreshToken?: string): Promise<void> {
    const address = normalizeWalletAddress(user.address);
    await this.redis.set(
      RedisNamespace.BLACKLIST,
      user.jti,
      '1',
      this.config.accessTtlSeconds,
    );
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
          secret: this.config.jwtSecret,
        });
        if (normalizeWalletAddress(payload.sub) === address) {
          await this.redis.del(
            RedisNamespace.SESSION,
            `refresh:${payload.jti}`,
          );
        }
      } catch {
        // An unusable refresh token needs no revocation.
      }
    }
    this.audit.log(`logout address=${address}`);
  }

  async revokeAllSessions(user: AuthUser): Promise<number> {
    return this.revokeSessions(user.address, user.address);
  }

  async adminRevokeAllSessions(
    actor: AuthUser,
    targetAddress: string,
  ): Promise<number> {
    return this.revokeSessions(actor.address, targetAddress);
  }

  /**
   * Immediately invalidates every active session for moderation actions
   * (suspension, status deactivation, deletion) without user rate-limiting.
   */
  async invalidateUserSessions(targetAddress: string): Promise<number> {
    const target = normalizeWalletAddress(targetAddress);
    await this.incrementTokenVersion(target);
    const revokedCount = await this.redis.revokeRefreshTokensForUser(target);
    this.audit.log(
      JSON.stringify({
        eventType: 'sessions_invalidated_moderation',
        targetAddress: target,
        revokedCount,
      }),
    );
    return revokedCount;
  }

  async isTokenVersionCurrent(
    address: string,
    tokenVersion?: number,
  ): Promise<boolean> {
    return (
      (tokenVersion ?? 0) ===
      (await this.tokenVersionFor(normalizeWalletAddress(address)))
    );
  }

  async isUserActive(address: string): Promise<boolean> {
    const normalizedAddress = normalizeWalletAddress(address);
    const user = await this.users.findOne({
      where: { walletAddress: normalizedAddress },
      withDeleted: true,
    });
    if (!user) {
      return !this.config.requireEmailVerification;
    }
    if (user.deletedAt) return false;
    const status = user.status ?? UserStatus.ACTIVE;
    return status === UserStatus.ACTIVE;
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.redis.exists(RedisNamespace.BLACKLIST, jti);
  }

  rolesFor(address: string): Role[] {
    const normalizedAddress = normalizeWalletAddress(address);
    const roles = [Role.USER];
    if (
      this.config.mentorAddresses.some(
        (configured) => configured.trim().toLowerCase() === normalizedAddress,
      )
    ) {
      roles.push(Role.MENTOR);
    }
    if (
      this.config.adminAddresses.some(
        (configured) => configured.trim().toLowerCase() === normalizedAddress,
      )
    ) {
      roles.push(Role.ADMIN);
    }
    return roles;
  }

  /**
   * Verifies the account can sign in, automatically expiring temporary
   * suspensions whose `suspendedUntil` timestamp has elapsed.
   */
  private async resolveLoginStatus(address: string): Promise<UserStatus> {
    const user = await this.users.findOne({
      where: { walletAddress: address },
      withDeleted: true,
    });
    if (!user) {
      if (this.config.requireEmailVerification) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          code: 'ACCOUNT_PENDING_VERIFICATION',
          message: 'Email verification is required before signing in.',
        });
      }
      return UserStatus.ACTIVE;
    }

    if (user.deletedAt || user.status === UserStatus.DELETED) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'ACCOUNT_DELETED',
        message: 'This account has been deleted.',
      });
    }

    const status = user.status ?? UserStatus.ACTIVE;

    if (status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'ACCOUNT_PENDING_VERIFICATION',
        message: 'Email verification is required before signing in.',
      });
    }

    if (status === UserStatus.SUSPENDED) {
      const activeSuspension = await this.findActiveSuspension(address);
      if (
        activeSuspension &&
        activeSuspension.suspendedUntil !== null &&
        new Date(activeSuspension.suspendedUntil).getTime() <= Date.now()
      ) {
        await this.expireSuspension(user, activeSuspension);
        return UserStatus.ACTIVE;
      }

      const reason =
        activeSuspension?.reason ?? 'Account suspended by an administrator';
      const expectedEndDate = activeSuspension?.suspendedUntil
        ? new Date(activeSuspension.suspendedUntil).toISOString()
        : null;
      const message = expectedEndDate
        ? `Your account is suspended until ${expectedEndDate}. Reason: ${reason}`
        : `Your account is permanently suspended. Reason: ${reason}`;

      this.audit.warn(
        `login_blocked_suspended address=${address} until=${expectedEndDate ?? 'permanent'}`,
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'ACCOUNT_SUSPENDED',
        message,
        reason,
        suspendedUntil: expectedEndDate,
      });
    }

    return status;
  }

  private async findActiveSuspension(
    address: string,
  ): Promise<UserSuspension | null> {
    if (!this.suspensions) return null;
    return this.suspensions.findOne({
      where: { walletAddress: address, isActive: true },
      order: { suspendedAt: 'DESC' },
    });
  }

  private async expireSuspension(
    user: User,
    suspension: UserSuspension,
  ): Promise<void> {
    const now = new Date();
    suspension.isActive = false;
    suspension.liftedAt = now;
    suspension.liftedBy = 'system:expired';
    if (this.suspensions) {
      await this.suspensions.save(suspension);
    }

    user.status = UserStatus.ACTIVE;
    if (typeof this.users.save === 'function') {
      await this.users.save(user);
    }
    await this.auditService?.record({
      event: AuditEvent.USER_SUSPENSION_EXPIRED,
      walletAddress: 'system:expired',
      targetId: user.walletAddress,
      metadata: {
        suspensionId: suspension.id,
        suspendedUntil: suspension.suspendedUntil?.toISOString() ?? null,
      },
    });
    this.audit.log(
      `suspension_expired address=${user.walletAddress} suspensionId=${suspension.id}`,
    );
  }

  private async issueTokens(
    address: string,
    roles: Role[],
    status: UserStatus,
    tokenVersion: number,
  ): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = await this.jwt.signAsync(
      {
        sub: address,
        roles,
        status,
        type: 'access',
        jti: accessJti,
        ver: tokenVersion,
      } satisfies JwtPayload,
      {
        secret: this.config.jwtSecret,
        expiresIn: this.config.accessTtlSeconds,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      {
        sub: address,
        roles,
        status,
        type: 'refresh',
        jti: refreshJti,
        ver: tokenVersion,
      } satisfies JwtPayload,
      {
        secret: this.config.jwtSecret,
        expiresIn: this.config.refreshTtlSeconds,
      },
    );
    await this.redis.set(
      RedisNamespace.SESSION,
      `refresh:${refreshJti}`,
      address,
      this.config.refreshTtlSeconds,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  private async revokeSessions(
    actorAddress: string,
    targetAddress: string,
  ): Promise<number> {
    const actor = normalizeWalletAddress(actorAddress);
    const target = normalizeWalletAddress(targetAddress);
    const requests = await this.redis.incrementWithExpiry(
      RedisNamespace.RATE_LIMIT,
      `revoke-all:${actor}`,
      60 * 60,
    );
    if (requests > 3) {
      throw new HttpException(
        'Session revocation limit exceeded; try again in one hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.incrementTokenVersion(target);
    const revokedCount = await this.redis.revokeRefreshTokensForUser(target);
    this.audit.log(
      JSON.stringify({
        eventType: 'sessions_revoked',
        actorAddress: actor,
        targetAddress: target,
        revokedCount,
      }),
    );
    return revokedCount;
  }

  private async tokenVersionFor(address: string): Promise<number> {
    const user = await this.users.findOne({
      where: { walletAddress: address },
      withDeleted: true,
    });
    return user?.tokenVersion ?? 0;
  }

  private async incrementTokenVersion(address: string): Promise<void> {
    await this.users.query(
      `INSERT INTO users (wallet_address, token_version)
       VALUES ($1, 1)
       ON CONFLICT (wallet_address)
       DO UPDATE SET token_version = users.token_version + 1`,
      [address],
    );
  }

  private async issueNonce(
    address: string,
  ): Promise<{ nonce: string; expiresAt: string }> {
    const normalizedAddress = normalizeWalletAddress(address);
    const requestCount = await this.redis.incrementWithExpiry(
      RedisNamespace.RATE_LIMIT,
      `nonce:${normalizedAddress}`,
      60,
    );
    if (requestCount > 5) {
      throw new HttpException(
        'Nonce request limit exceeded; try again in one minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const nonce = randomBytes(32).toString('hex');
    await this.redis.set(
      RedisNamespace.SESSION,
      `nonce:${normalizedAddress}`,
      nonce,
      this.config.nonceTtlSeconds,
    );
    this.audit.log(`nonce_issued address=${normalizedAddress}`);
    return {
      nonce,
      expiresAt: new Date(
        Date.now() + this.config.nonceTtlSeconds * 1000,
      ).toISOString(),
    };
  }
}
