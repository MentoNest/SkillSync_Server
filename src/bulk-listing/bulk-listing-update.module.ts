import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Listing } from './entities/listing.entity';
import { BulkListingUpdateService } from './bulk-listing-update.service';
import { BulkListingUpdateController } from './bulk-listing-update.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Listing])],
  controllers: [BulkListingUpdateController],
  providers: [BulkListingUpdateService],
  exports: [BulkListingUpdateService],
})
export class BulkListingUpdateModule {}
