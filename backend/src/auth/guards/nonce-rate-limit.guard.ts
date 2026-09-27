import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../services/redis.service.js';

/**
 * #1313: rate limit for nonce requests - 5 per minute per wallet address.
 *
 * The limit and the window are configurable (`NONCE_RATE_LIMIT_MAX`), because a
 * wallet behind a shared NAT should not be able to lock every other user out of
 * the challenge endpoint.
 */
@Injectable()
export class NonceRateLimitGuard implements CanActivate {
  private readonly WINDOW_SECONDS = 60; // 1 minute

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletAddress = String(request.params?.walletAddress ?? request.ip ?? 'unknown');
    const key = `ratelimit:nonce:${walletAddress.toLowerCase()}`;

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, this.WINDOW_SECONDS);
    }

    const maxRequests = getAuthTokenConfig().nonceRateLimitMax;

    if (count > maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded: maximum ${maxRequests} nonce requests per minute per wallet`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
