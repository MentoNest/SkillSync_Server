import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../services/redis.service';

/**
 * #1147: Rate limit for wallet signature login attempts.
 * Allows a maximum of 10 attempts per 15 minutes per wallet address
 * (falls back to client IP when no wallet address is supplied).
 */
@Injectable()
export class WalletLoginRateLimitGuard implements CanActivate {
  private readonly MAX_ATTEMPTS = 10;
  private readonly WINDOW_SECONDS = 900; // 15 minutes

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletAddress = request.body?.walletAddress || request.ip;
    const key = `ratelimit:wallet-login:${walletAddress.toLowerCase()}`;

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, this.WINDOW_SECONDS);
    }

    if (count > this.MAX_ATTEMPTS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded: maximum 10 login attempts per 15 minutes per wallet',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
