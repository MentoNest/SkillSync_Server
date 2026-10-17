import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';

/**
 * Shared TypeORM options for the running app and the migration CLI.
 * `DATABASE_URL` wins; otherwise the individual DB_* variables are used.
 * Schema changes go through migrations only (`synchronize` is always off).
 */
export function buildDataSourceOptions(env: Record<string, string | undefined>): DataSourceOptions {
  const common = {
    type: 'postgres' as const,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    subscribers: [join(__dirname, '..', '**', '*.subscriber.{ts,js}')],
    synchronize: false,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
  if (env.DATABASE_URL) {
    return { ...common, url: env.DATABASE_URL };
  }
  return {
    ...common,
    host: env.DB_HOST ?? 'localhost',
    port: parseInt(env.DB_PORT ?? '5432', 10),
    username: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    database: env.DB_NAME ?? 'skillsync',
  };
}

export const databaseConfigFactory = (config: ConfigService): DataSourceOptions =>
  buildDataSourceOptions({
    DATABASE_URL: config.get<string>('DATABASE_URL'),
    DB_HOST: config.get<string>('DB_HOST'),
    DB_PORT: config.get<string>('DB_PORT'),
    DB_USER: config.get<string>('DB_USER'),
    DB_PASSWORD: config.get<string>('DB_PASSWORD'),
    DB_NAME: config.get<string>('DB_NAME'),
    DB_SSL: config.get<string>('DB_SSL'),
  });
