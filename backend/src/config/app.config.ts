import { registerAs } from '@nestjs/config';

/** Application-level configuration */
export const appConfig = registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'SkillSync',
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
}));
