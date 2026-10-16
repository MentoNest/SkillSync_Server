import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new Redis(c.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
