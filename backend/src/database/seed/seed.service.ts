import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { seedAdmin } from './admin.seed';

/**
 * SeedService runs database seeding once during application bootstrap,
 * before the HTTP server starts accepting requests.
 *
 * Implements OnApplicationBootstrap so that TypeORM connections are
 * fully established before seeding begins.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Running startup seeds...');
    try {
      await seedAdmin(this.dataSource);
    } catch (error) {
      // Log the error but do NOT crash the application — a seed failure
      // should not prevent the server from starting in non-critical cases.
      // Remove the catch if you want a hard failure on seed errors.
      this.logger.error(
        `Seed encountered an error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.log('Startup seeds complete.');
  }
}
