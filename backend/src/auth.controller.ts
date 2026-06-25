import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { Keypair, Networks, StrKey } from 'stellar-sdk';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth.service';
import { LoginDto } from './auth/login.dto';
import { UserService } from './auth/user.service';
import { LoginAttemptService } from './auth/login-attempt.service';
import { AuditLogService } from './auth/audit-log.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly auditLogService: AuditLogService,
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
}
