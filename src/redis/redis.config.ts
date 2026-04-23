import { RedisClientOptions } from 'redis';
import { AppConfigService } from '../config/app-config.service';

export interface RedisModuleOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectTimeout?: number;
}

export const createRedisConfig = async (
  configService: AppConfigService,
): Promise<RedisClientOptions> => {
  const redisConfig = configService.getRedisConfig();

  return {
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      connectTimeout: redisConfig.connectTimeout || 10000,
      reconnectStrategy: (retries) => {
        // Exponential backoff: min(retries * 100, 3000)
        const delay = Math.min(retries * 100, 3000);
        console.log(`Redis reconnect attempt ${retries}, retrying in ${delay}ms`);
        return delay;
      },
    },
    database: redisConfig.db || 0,
    password: redisConfig.password || undefined,
  };
};
