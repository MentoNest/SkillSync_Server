import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { DemoSeedModule } from './demo/demo-seed.module';

/**
 * SeedModule registers the SeedService which runs idempotent
 * database seeds on every application bootstrap.
 *
 * Import this module in AppModule to activate seeding.
 *
 * Demo data seeding is triggered when SEED_DEMO_DATA=true.
 */
@Module({
  imports: [DemoSeedModule],
  providers: [SeedService],
})
export class SeedModule {}
