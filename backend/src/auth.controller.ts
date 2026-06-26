import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { Keypair } from 'stellar-sdk';
import { normalizeWalletAddress } from './common/utils/wallet.utils';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth.service';
import { LoginDto } from './auth/login.dto';
import { RefreshTokenDto } from './auth/refresh-token.dto';
import { UserService } from './auth/user.service';
import { LoginAttemptService } from './auth/login-attempt.service';
import { AuditLogService } from './auth/audit-log.service';
import { RefreshTokenService } from './refresh-token/refresh-token.service';

@ApiTags('auth')
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
  @ApiOperation({
    summary: 'Request a sign-in nonce',
    description:
      'Generates a one-time nonce for the given Stellar wallet address. ' +
      'The wallet owner must sign the nonce with their private key within 5 minutes.',
  })
  @ApiParam({ name: 'walletAddress', description: 'Stellar ED25519 public key (56 chars, starts with G)' })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated successfully',
    schema: {
      type: 'object',
      required: ['nonce', 'expiresAt'],
      properties: {
        nonce: { type: 'string', example: 'a3f8...', description: '64-char hex nonce' },
        expiresAt: { type: 'string', format: 'date-time', description: 'ISO-8601 expiry timestamp' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid Stellar wallet address' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (5 requests/min)' })
  async getNonce(@Param('walletAddress') walletAddress: string) {
    const normalized = normalizeWalletAddress(walletAddress);

    await this.enforceRateLimit(normalized);

    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await this.redisService.set(normalized, nonce, 300, 'nonce');

    return { nonce, expiresAt };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate with Stellar wallet signature',
    description:
      'Verifies the Stellar signature over the nonce and issues JWT access and refresh tokens.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description: 'Authentication successful',
    schema: {
      type: 'object',
      required: ['accessToken', 'refreshToken', 'user'],
      properties: {
        accessToken: { type: 'string', description: 'Short-lived JWT access token (15 min)' },
        refreshToken: { type: 'string', description: 'Long-lived JWT refresh token (7 days)' },
        user: {
          type: 'object',
          required: ['id', 'wallet', 'roles', 'permissions'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            wallet: { type: 'string', description: 'Stellar public key' },
            roles: { type: 'array', items: { type: 'string' } },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid wallet address or network' })
  @ApiResponse({ status: 401, description: 'Nonce expired or invalid signature' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() dto: LoginDto) {
    const wallet = normalizeWalletAddress(dto.wallet);

    if (!['mainnet', 'testnet'].includes(dto.network)) {
      throw new HttpException('Invalid network', HttpStatus.BAD_REQUEST);
    }

    const attemptCount = await this.loginAttemptService.incrementAttempts(wallet);
    if (attemptCount > 10) {
      await this.auditLogService.logAttempt(wallet, 'failure', 'rate_limit_exceeded');
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const storedNonce = await this.redisService.get(wallet, 'nonce');
    if (!storedNonce) {
      await this.auditLogService.logAttempt(wallet, 'failure', 'nonce_expired');
      throw new HttpException('Nonce expired or invalid', HttpStatus.UNAUTHORIZED);
    }

    let valid = false;
    try {
      valid = this.verifySignature(wallet, dto.signature, storedNonce, dto.network);
    } finally {
      await this.deleteNonce(wallet);
    }

    if (!valid) {
      await this.auditLogService.logAttempt(wallet, 'failure', 'invalid_signature');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userService.findOrCreateByWallet(wallet);
    await this.loginAttemptService.resetAttempts(wallet);
    await this.auditLogService.logAttempt(wallet, 'success', 'login_success', user.id);

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