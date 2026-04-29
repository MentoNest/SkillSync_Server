import { Module, Global } from '@nestjs/common';
import { RequestContextService } from '../services/request-context.service';

/**
 * Global module that provides RequestContextService across the application.
 * Marked as @Global() so it doesn't need to be imported in every module.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
