import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

/** Closes the Redis connection when the app shuts down (#1483). */
@Injectable()
export class RedisShutdownHook implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new Redis(c.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
    },
    RedisShutdownHook,
  ],
  exports: [REDIS],
})
export class RedisModule {}
