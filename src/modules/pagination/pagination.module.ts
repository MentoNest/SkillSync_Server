import { Module } from '@nestjs/common';
import { PaginationService } from './pagination.service';

@Module({
  controllers: [],
  providers: [PaginationService],
  exports: [PaginationService],
})
export class PaginationModule {}
