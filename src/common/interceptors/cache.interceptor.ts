import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../redis/providers/cache.service';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private redisService: RedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = `route:${request.url}`;

    // Try to get from cache
    const cachedResponse = await this.redisService.get(cacheKey);
    if (cachedResponse) {
      return of(cachedResponse);
    }

    // If not in cache, execute the handler and store the result
    return next.handle().pipe(
      tap(async (response) => {
        // Cache only successful responses
        if (response) {
          // Cache for 5 minutes by default
          await this.redisService.set(cacheKey, response, 300);
        }
      }),
    );
  }
}
