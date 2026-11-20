import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDatabaseSettings } from './database.config';

/** Data source for the TypeORM CLI (migration:generate / run / revert). */
export default new DataSource(
  buildDatabaseSettings((key) => process.env[key]).options,
);
