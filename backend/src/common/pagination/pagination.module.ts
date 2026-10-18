import { Global, Module } from '@nestjs/common';
import { PaginationService } from './pagination.service';

/** Global so any module can inject {@link PaginationService} without re-importing (#1461). */
@Global()
@Module({
  providers: [PaginationService],
  exports: [PaginationService],
})
export class PaginationModule {}