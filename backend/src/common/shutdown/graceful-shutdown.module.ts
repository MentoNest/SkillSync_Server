import { Module, Global } from '@nestjs/common';
import { GracefulShutdownService } from './graceful-shutdown.service.js';

@Global()
@Module({
  providers: [GracefulShutdownService],
  exports: [GracefulShutdownService],
})
export class GracefulShutdownModule {}
