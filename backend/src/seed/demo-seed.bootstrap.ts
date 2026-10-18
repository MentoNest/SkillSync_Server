import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DemoSeedService } from './demo-seed.service';

/**
 * When SEED_DEMO_DATA=true, seed demo accounts on application start (#1474).
 * Disabled by default so production is never polluted.
 */
@Injectable()
export class DemoSeedBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedBootstrap.name);

  constructor(
    private readonly config: ConfigService,
    private readonly demoSeed: DemoSeedService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const flag = this.config.get<string>('SEED_DEMO_DATA');
    if (flag !== 'true' && flag !== '1') {
      return;
    }
    try {
      const result = await this.demoSeed.seed();
      this.logger.log(
        `SEED_DEMO_DATA: ${result.mentors} mentors, ${result.mentees} mentees ready`,
      );
    } catch (err) {
      this.logger.error(
        `SEED_DEMO_DATA failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
