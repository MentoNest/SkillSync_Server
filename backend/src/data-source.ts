import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from './config/database.config';

/**
 * TypeORM CLI entry point (#1141).
 *
 * Used by the `migration:generate` / `migration:run` / `migration:revert`
 * npm scripts, e.g.:
 *
 *   npm run migration:generate -- src/migrations/AddSomething
 *   npm run migration:run
 *   npm run migration:revert
 *
 * Shares the exact same connection settings as the running application
 * (see `src/config/database.config.ts`), except `synchronize` is always
 * disabled here — schema changes made through the CLI must go through
 * migrations, never through auto-sync.
 */
export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),
  synchronize: false,
});

export default AppDataSource;
