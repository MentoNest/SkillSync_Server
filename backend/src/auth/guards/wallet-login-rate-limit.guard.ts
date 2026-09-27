import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../services/redis.service.js';

/**
 * #1314: rate limit for wallet signature login attempts - 10 per 15 minutes per
 * wallet address, falling back to the client IP when no address is supplied.
 *
 * Both values are configurable (`WALLET_LOGIN_RATE_LIMIT_MAX`,
 * `WALLET_LOGIN_RATE_LIMIT_WINDOW_SECONDS`).
 */
@Injectable()
export class WalletLoginRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletAddress = String(request.body?.walletAddress ?? request.ip ?? 'unknown');
    const key = `ratelimit:wallet-login:${walletAddress.toLowerCase()}`;

    const { walletLoginRateLimitMax, walletLoginRateLimitWindowSeconds } = getAuthTokenConfig();

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, walletLoginRateLimitWindowSeconds);
    }

    if (count > walletLoginRateLimitMax) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded: maximum ${walletLoginRateLimitMax} login attempts per ${Math.round(
            walletLoginRateLimitWindowSeconds / 60,
          )} minutes per wallet`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
