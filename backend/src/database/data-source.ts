import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseConfig, getDatabaseRetryConfig } from '../config/database.config.js';

/**
 * TypeORM CLI data source (#1421).
 *
 * Backs the `migration:generate` / `migration:run` / `migration:revert` npm
 * scripts. Shares the connection settings with the running application but
 * always runs with `synchronize: false` — schema changes must go through
 * migrations, never auto-sync.
 *
 * Entities are loaded from the compiled source glob (`src/**/*.entity.ts`)
 * because the CLI executes TypeScript directly via ts-node.
 */
export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),
  entities: ['src/**/*.entity.ts'],
  autoLoadEntities: false,
  synchronize: false,
  migrations: ['src/database/migrations/*.ts'],
  retryAttempts: getDatabaseRetryConfig().retryAttempts,
  retryDelay: getDatabaseRetryConfig().retryDelay,
});

export default AppDataSource;
