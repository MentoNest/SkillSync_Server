import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '../common/errors/error-codes';
import { RedisNamespace } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
import type { AuthUser } from '../auth/auth.types';

const PROFILE_UPDATE_LIMIT = 30;
const PROFILE_UPDATE_WINDOW_SECONDS = 60 * 60;

@Injectable()
export class ProfileUpdateRateLimitGuard {
  constructor(private readonly redis: RedisService) {}

  async canActivate(
    context: import('@nestjs/common').ExecutionContext,
  ): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new UnauthorizedException('Authentication is required.');

    const count = await this.redis.incrementWithExpiry(
      RedisNamespace.RATE_LIMIT,
      `profile-update:${user.address.toLowerCase()}`,
      PROFILE_UPDATE_WINDOW_SECONDS,
    );
    if (count > PROFILE_UPDATE_LIMIT) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Profile update limit exceeded; try again in one hour.',
          error: 'Too Many Requests',
          code: ErrorCode.RATE_LIMITED,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
