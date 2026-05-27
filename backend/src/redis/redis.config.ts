import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'skillsync:',
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT ?? '10000', 10),
}));
