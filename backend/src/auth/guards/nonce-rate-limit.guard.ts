import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../services/redis.service';

/**
 * #1146: Rate limit for nonce requests.
 * Allows a maximum of 5 requests per minute per wallet address.
 */
@Injectable()
export class NonceRateLimitGuard implements CanActivate {
  private readonly MAX_REQUESTS = 5;
  private readonly WINDOW_SECONDS = 60; // 1 minute

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletAddress = request.params?.walletAddress || request.ip;
    const key = `ratelimit:nonce:${walletAddress.toLowerCase()}`;

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, this.WINDOW_SECONDS);
    }

    if (count > this.MAX_REQUESTS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded: maximum 5 nonce requests per minute per wallet',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
