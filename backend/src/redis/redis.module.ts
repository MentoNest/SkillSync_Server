import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { buildRedisConfig, reconnectDelay } from './redis.config';
import { RedisHealthController } from './redis.health.controller';
import { REDIS_CLIENT, REDIS_KEY_PREFIX, RedisService } from './redis.service';

/**
 * Shared Redis connection (caching, sessions, rate limit counters, token blacklist, queues).
 * Import this module wherever `RedisService` is needed.
 */
@Module({
  controllers: [RedisHealthController],
  providers: [
    {
      provide: REDIS_KEY_PREFIX,
      useFactory: () => buildRedisConfig((key) => process.env[key]).keyPrefix,
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const config = buildRedisConfig((key) => process.env[key]);
        const logger = new Logger('Redis');
        const client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          connectTimeout: config.connectTimeout,
          retryStrategy: reconnectDelay,
          maxRetriesPerRequest: 3,
        });
        client.on('error', (error) =>
          logger.error(`Redis error: ${error.message}`),
        );
        client.on('reconnecting', () => logger.warn('Reconnecting to Redis'));
        client.on('ready', () => logger.log('Redis connection ready'));
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
