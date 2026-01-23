// import { Module } from '@nestjs/common';
// import { HealthController } from './health.controller';
// import { HealthService } from './health.service';

// @Module({
//   controllers: [HealthController],
//   providers: [HealthService],
// })
// export class HealthModule {}

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService], // Export in case other modules need health checks
})
export class HealthModule {}
