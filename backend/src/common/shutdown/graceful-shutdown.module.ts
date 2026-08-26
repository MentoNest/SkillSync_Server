import { Module, Global } from '@nestjs/common';
import { GracefulShutdownService } from './graceful-shutdown.service';

@Global()
@Module({
  providers: [GracefulShutdownService],
  exports: [GracefulShutdownService],
})
export class GracefulShutdownModule {}
