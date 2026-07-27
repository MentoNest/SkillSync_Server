import { Global, Module } from '@nestjs/common';
import { PaginationService } from './pagination.service.js';

/**
 * #1007: Global module so any feature module can inject PaginationService
 * without re-declaring it as a provider.
 */
@Global()
@Module({
  providers: [PaginationService],
  exports: [PaginationService],
})
export class PaginationModule {}
