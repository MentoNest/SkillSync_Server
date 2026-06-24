import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Keypair, StrKey } from 'stellar-sdk';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth.service';
import { LoginDto } from './auth/login.dto';
import { RefreshTokenDto } from './auth/refresh-token.dto';
import { UserService } from './auth/user.service';
import { LoginAttemptService } from './auth/login-attempt.service';
import { AuditLogService } from './auth/audit-log.service';
import { RefreshTokenService } from './refresh-token/refresh-token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly auditLogService: AuditLogService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  @Get('nonce/:walletAddress')
  async getNonce(@Param('walletAddress') walletAddress: string) {
    if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new HttpException('Invalid Stellar wallet address', HttpStatus.BAD_REQUEST);
    }

    await this.enforceRateLimit(walletAddress);

    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await this.redisService.set(walletAddress, nonce, 300, 'nonce');

    return { nonce, expiresAt };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    if (!StrKey.isValidEd25519PublicKey(dto.wallet)) {
      throw new HttpException('Invalid Stellar wallet address', HttpStatus.BAD_REQUEST);
    }

    if (!['mainnet', 'testnet'].includes(dto.network)) {
      throw new HttpException('Invalid network', HttpStatus.BAD_REQUEST);
    }

    const attemptCount = await this.loginAttemptService.incrementAttempts(dto.wallet);
    if (attemptCount > 10) {
      await this.auditLogService.logAttempt(dto.wallet, 'failure', 'rate_limit_exceeded');
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const storedNonce = await this.redisService.get(dto.wallet, 'nonce');
    if (!storedNonce) {
      await this.auditLogService.logAttempt(dto.wallet, 'failure', 'nonce_expired');
      throw new HttpException('Nonce expired or invalid', HttpStatus.UNAUTHORIZED);
    }

    let valid = false;
    try {
      valid = this.verifySignature(dto.wallet, dto.signature, storedNonce, dto.network);
    } finally {
      await this.deleteNonce(dto.wallet);
    }

    if (!valid) {
      await this.auditLogService.logAttempt(dto.wallet, 'failure', 'invalid_signature');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userService.findOrCreateByWallet(dto.wallet);
    await this.loginAttemptService.resetAttempts(dto.wallet);
    await this.auditLogService.logAttempt(dto.wallet, 'success', 'login_success', user.id);

    const accessToken = await this.authService.issueAccessToken(user.id, user.wallet, user.roles, user.permissions);
    const refreshToken = await this.authService.issueRefreshToken(user.id);

    const jti = this.extractJtiFromToken(refreshToken);
    await this.refreshTokenService.createRefreshToken(
      user,
      jti,
      undefined,
      undefined,
      undefined,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        wallet: user.wallet,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto, @Req() req: any) {
    const { refreshToken } = body;

    if (!refreshToken) {
      throw new HttpException('Refresh token is required', HttpStatus.BAD_REQUEST);
    }

    const refreshTokenEntity = await this.refreshTokenService.validateRefreshToken(refreshToken);
    
    if (refreshTokenEntity.expiresAt < new Date()) {
      throw new HttpException('Refresh token expired', HttpStatus.UNAUTHORIZED);
    }

    const user = refreshTokenEntity.user;
    const userAgent = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.connection?.remoteAddress || undefined;
    
    try {
      await this.refreshTokenService.rotateRefreshToken(
        refreshToken,
        user,
        undefined,
        userAgent,
        ipAddress,
      );

      const accessToken = await this.authService.issueAccessToken(
        user.id,
        user.wallet,
        user.roles,
        user.permissions,
      );

      const newRefreshTokenString = await this.authService.issueRefreshToken(user.id);

      return {
        accessToken,
        refreshToken: newRefreshTokenString,
        user: {
          id: user.id,
          wallet: user.wallet,
          roles: user.roles,
          permissions: user.permissions,
        },
      };
    } catch (error) {
      if (error.message?.includes('already used')) {
        await this.auditLogService.logAttempt(
          user.id,
          'failure',
          'refresh_token_reuse_detected',
          user.id,
        );
        throw new HttpException('Security alert: Token reuse detected', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(error.message || 'Failed to refresh token', HttpStatus.UNAUTHORIZED);
    }
  }

  private deleteNonce(wallet: string) {
    return this.redisService.del(wallet, 'nonce');
  }

  private verifySignature(wallet: string, signature: string, nonce: string, network: string) {
    try {
      const payload = Buffer.from(`${network}:${nonce}`, 'utf8');
      const keypair = Keypair.fromPublicKey(wallet);
      return keypair.verify(payload, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }

  private async enforceRateLimit(walletAddress: string): Promise<void> {
    const rateKey = `rate:${walletAddress}`;
    const client = this.redisService.getClient();
    const currentCount = await client.incr(rateKey);

    if (currentCount === 1) {
      await client.expire(rateKey, 60);
    }

    if (currentCount > 5) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private extractJtiFromToken(token: string): string {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return 'unknown';
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload.jti || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}