import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { randomBytes, randomUUID } from 'crypto';
import { InvalidCredentialsException, TokenExpiredException } from '../common/errors/app-exceptions';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { RedisNamespace } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
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
  ) {}

  /** Issues a single-use nonce for the wallet and the exact message it must sign. */
  async createNonce(address: string): Promise<{ nonce: string; message: string; expiresIn: number }> {
    const normalizedAddress = normalizeWalletAddress(address);
    const { nonce } = await this.issueNonce(normalizedAddress);
    return { nonce, message: loginMessage(normalizedAddress, nonce), expiresIn: this.config.nonceTtlSeconds };
  }

  /** Issues a nonce with its absolute expiry for the path-based nonce endpoint. */
  async createNonceWithExpiry(address: string): Promise<{ nonce: string; expiresAt: string }> {
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
      this.audit.warn(`login_failed address=${normalizedAddress} reason=no_nonce`);
      throw new InvalidCredentialsException('No active nonce for this address; request a new one');
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
      this.audit.warn(`login_failed address=${normalizedAddress} reason=bad_signature`);
      throw new InvalidCredentialsException('Signature verification failed');
    }
    return { address: normalizedAddress, roles: this.rolesFor(normalizedAddress), jti: '' };
  }

  async login(address: string, signature: string): Promise<TokenPair> {
    return this.issueForUser(await this.verifyWallet(address, signature));
  }

  /** Issues tokens for a wallet that has already been verified (e.g. by the wallet guard). */
  async issueForUser(user: AuthUser): Promise<TokenPair> {
    const address = normalizeWalletAddress(user.address);
    const tokens = await this.issueTokens(address, user.roles);
    this.audit.log(`login_succeeded address=${address}`);
    return tokens;
  }

  /** Rotates the refresh token: the presented one stops working. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: this.config.jwtSecret });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') throw new TokenExpiredException();
      throw new InvalidCredentialsException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new InvalidCredentialsException('Invalid refresh token');

    const stored = await this.redis.get(RedisNamespace.SESSION, `refresh:${payload.jti}`);
    if (stored !== payload.sub) {
      this.audit.warn(`refresh_rejected address=${payload.sub} reason=unknown_or_used`);
      throw new InvalidCredentialsException('Refresh token is no longer valid');
    }
    await this.redis.del(RedisNamespace.SESSION, `refresh:${payload.jti}`);
    const tokens = await this.issueTokens(payload.sub, this.rolesFor(payload.sub));
    this.audit.log(`token_refreshed address=${payload.sub}`);
    return tokens;
  }

  /** Revokes the current access token and the session's refresh token. */
  async logout(user: AuthUser, refreshToken?: string): Promise<void> {
    const address = normalizeWalletAddress(user.address);
    await this.redis.set(RedisNamespace.BLACKLIST, user.jti, '1', this.config.accessTtlSeconds);
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: this.config.jwtSecret });
        if (normalizeWalletAddress(payload.sub) === address) {
          await this.redis.del(RedisNamespace.SESSION, `refresh:${payload.jti}`);
        }
      } catch {
        // An unusable refresh token needs no revocation.
      }
    }
    this.audit.log(`logout address=${address}`);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.redis.exists(RedisNamespace.BLACKLIST, jti);
  }

  rolesFor(address: string): Role[] {
    const normalizedAddress = normalizeWalletAddress(address);
    const roles = [Role.USER];
    if (this.config.mentorAddresses.some((configured) => configured.trim().toLowerCase() === normalizedAddress)) {
      roles.push(Role.MENTOR);
    }
    if (this.config.adminAddresses.some((configured) => configured.trim().toLowerCase() === normalizedAddress)) {
      roles.push(Role.ADMIN);
    }
    return roles;
  }

  private async issueTokens(address: string, roles: Role[]): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: address, roles, type: 'access', jti: accessJti } satisfies JwtPayload,
      { secret: this.config.jwtSecret, expiresIn: this.config.accessTtlSeconds },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: address, roles, type: 'refresh', jti: refreshJti } satisfies JwtPayload,
      { secret: this.config.jwtSecret, expiresIn: this.config.refreshTtlSeconds },
    );
    await this.redis.set(RedisNamespace.SESSION, `refresh:${refreshJti}`, address, this.config.refreshTtlSeconds);
    return { accessToken, refreshToken, expiresIn: this.config.accessTtlSeconds };
  }

  private async issueNonce(address: string): Promise<{ nonce: string; expiresAt: string }> {
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
      expiresAt: new Date(Date.now() + this.config.nonceTtlSeconds * 1000).toISOString(),
    };
  }
}
