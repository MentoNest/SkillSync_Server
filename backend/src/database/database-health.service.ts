import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Checks that the database really answers, not only that a connection object exists. */
@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Runs `SELECT 1`; throws a descriptive error when the database is not reachable. */
  async verify(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) {
        throw new Error('the data source is not initialized');
      }
      await this.dataSource.query('SELECT 1');
      this.logger.log('Database connection verified');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Database connection check failed: ${reason}`);
    }
  }
}
