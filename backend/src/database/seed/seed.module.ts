import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';

/**
 * SeedModule registers the SeedService which runs idempotent
 * database seeds on every application bootstrap.
 *
 * Import this module in AppModule to activate seeding.
 */
@Module({
  providers: [SeedService],
})
export class SeedModule {}
