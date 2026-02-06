import { Module } from '@nestjs/common';
import { PaginationService } from './pagination.service';

@Module({
  controllers: [],
  providers: [PaginationService],
})
export class PaginationModule {}
