import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { JwtAccessTokenPayload } from './interfaces/jwt-payload.interface.js';
import { WalletStrategy } from './strategies/wallet.strategy.js';
import { TokenBlacklistService } from './services/token-blacklist.service.js';

/**
 * #971-978: Auth service handling wallet login, JWT lifecycle, and session management.
 *
 * - #972: Nonce generation for wallet login
 * - #973: Wallet signature verification
 * - #974: JWT access token issuance
 * - #975: Refresh token support
 * - #976: Logout and token invalidation
 * - #977: Role-based access control
 * - #978: Seed default admin
 */

interface StoredNonce {
  nonce: string;
  expiresAt: number;
  walletAddress: string;
}

interface RefreshTokenRecord {
  jti: string;
  walletAddress: string;
  expiresAt: number;
  revoked: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private nonces = new Map<string, StoredNonce>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private revokedAccessTokens = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly walletStrategy: WalletStrategy,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  /**
   * #972: Generate a nonce for the given wallet address.
   */
  requestNonce(walletAddress: string): { nonce: string; expiresAt: number } {
    // Clean expired nonces
    this.cleanExpiredNonces();

    const { nonce, expiresAt } = this.walletStrategy.generateNonce();
    this.nonces.set(walletAddress, { nonce, expiresAt, walletAddress });

    this.logger.log(`Nonce generated for ${walletAddress.slice(0, 8)}...`);
    return { nonce, expiresAt };
  }

  /**
   * #973: Verify wallet signature and issue tokens.
   * #974: Returns access + refresh token pair.
   */
  async login(
    walletAddress: string,
    signature: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Retrieve and validate nonce
    const stored = this.nonces.get(walletAddress);
    if (!stored) {
      throw new UnauthorizedException('No nonce requested for this wallet');
    }
    if (Date.now() > stored.expiresAt) {
      this.nonces.delete(walletAddress);
      throw new UnauthorizedException('Nonce has expired. Request a new one.');
    }
    if (stored.nonce !== signature) {
      throw new UnauthorizedException('Nonce mismatch');
    }

    // Verify signature
    const isValid = this.walletStrategy.verify(
      walletAddress,
      stored.nonce,
      signature,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // Clean used nonce
    this.nonces.delete(walletAddress);

    // Issue tokens
    return this.issueTokenPair(walletAddress);
  }

  /**
   * #974-975: Issue access + refresh token pair.
   */
  private async issueTokenPair(walletAddress: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const accessJti = uuidv4();
    const refreshJti = uuidv4();
    const accessTtl = parseInt(
      this.configService.get('JWT_ACCESS_TTL', '900'),
      10,
    ); // 15 min
    const refreshTtl = parseInt(
      this.configService.get('JWT_REFRESH_TTL', '604800'),
      10,
    ); // 7 days

    const roles = await this.resolveRoles(walletAddress);

    const accessPayload: JwtAccessTokenPayload = {
      sub: walletAddress,
      wallet: walletAddress,
      jti: accessJti,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + accessTtl,
      roles,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload);

    const refreshToken = await this.jwtService.signAsync(
      { sub: walletAddress, jti: refreshJti, type: 'refresh' },
      { expiresIn: refreshTtl },
    );

    // Store refresh token record
    this.refreshTokens.set(refreshJti, {
      jti: refreshJti,
      walletAddress,
      expiresAt: Date.now() + refreshTtl * 1000,
      revoked: false,
    });

    this.logger.log(`Tokens issued for ${walletAddress.slice(0, 8)}...`);

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /**
   * #975: Refresh an access token using a valid refresh token.
   */
  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        jti: string;
        type: string;
      }>(refreshToken, {
        secret: this.configService.get('JWT_SECRET', 'dev-secret'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const record = this.refreshTokens.get(payload.jti);
      if (!record || record.revoked) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      // Rotate: revoke old, issue new pair
      record.revoked = true;
      return this.issueTokenPair(record.walletAddress);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * #976: Logout — revoke both access and refresh tokens.
   *
   * The access token jti is blacklisted in Redis (rather than only the
   * in-process Set) so revocation survives restarts and applies across
   * every server instance.
   */
  async logout(accessTokenJti: string, accessTokenExp?: number, refreshJti?: string): Promise<void> {
    if (accessTokenJti) {
      this.revokedAccessTokens.add(accessTokenJti);
      const ttlSeconds = accessTokenExp
        ? accessTokenExp - Math.floor(Date.now() / 1000)
        : parseInt(this.configService.get('JWT_ACCESS_TTL', '900'), 10);
      await this.tokenBlacklistService.blacklist(accessTokenJti, ttlSeconds);
    }
    if (refreshJti) {
      const record = this.refreshTokens.get(refreshJti);
      if (record) {
        record.revoked = true;
      }
    }
    this.logger.log('Session revoked');
  }

  /**
   * Check if an access token has been revoked.
   */
  isTokenRevoked(jti: string): boolean {
    return this.revokedAccessTokens.has(jti);
  }

  /**
   * #978: Seed default admin role and user.
   */
  seedAdmin(walletAddress: string): void {
    this.logger.log(`Admin seeded for ${walletAddress.slice(0, 8)}...`);
    // In production: persist to database via UsersService
  }

  private resolveRoles(walletAddress: string): Promise<string[]> {
    // In production: query from database, keyed by walletAddress
    // Default role for all authenticated users
    void walletAddress;
    return Promise.resolve(['MENTEE']);
  }

  private cleanExpiredNonces(): void {
    const now = Date.now();
    for (const [key, value] of this.nonces) {
      if (now > value.expiresAt) {
        this.nonces.delete(key);
      }
    }
  }
}
