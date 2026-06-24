import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth.service';

interface IssueTokenDto {
  userId: string;
  wallet: string;
  roles: string[];
  permissions: string[];
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {}

  @Get('nonce/:walletAddress')
  async getNonce(@Param('walletAddress') walletAddress: string) {
    if (!this.isValidStellarAddress(walletAddress)) {
      throw new HttpException('Invalid Stellar wallet address', HttpStatus.BAD_REQUEST);
    }

    await this.enforceRateLimit(walletAddress);

    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await this.redisService.set(walletAddress, nonce, 300, 'nonce');

    return { nonce, expiresAt };
  }

  @Post('token')
  async issueToken(@Body() body: IssueTokenDto) {
    if (!body.userId || !body.wallet || !Array.isArray(body.roles) || !Array.isArray(body.permissions)) {
      throw new HttpException('Missing token payload fields', HttpStatus.BAD_REQUEST);
    }

    return {
      accessToken: await this.authService.issueAccessToken(
        body.userId,
        body.wallet,
        body.roles,
        body.permissions,
      ),
    };
  }

  private isValidStellarAddress(address: string): boolean {
    return /^G[A-Z2-7]{55}$/.test(address);
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
