import { DataSource } from 'typeorm';
import { DataSourceOptions } from 'typeorm/data-source/DataSourceOptions';

const config: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  logging: process.env.DB_LOGGING === 'true',
  entities: ['apps/api/src/**/*.entity.{ts,js}'],
  migrations: ['apps/api/src/migrations/*.ts'],
  synchronize: false,
  migrationsRun: false,
};

export const AppDataSource = new DataSource(config);
