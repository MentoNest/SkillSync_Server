import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../services/redis.service';

@Injectable()
export class RevokeAllRateLimitGuard implements CanActivate {
  private readonly MAX_REQUESTS = 3;
  private readonly WINDOW_SECONDS = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const identifier = user?.id || user?.walletAddress || request.ip;
    const key = `ratelimit:revoke-all:${identifier}`;

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, this.WINDOW_SECONDS);
    }

    if (count > this.MAX_REQUESTS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded: You can only revoke all sessions 3 times per hour',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
