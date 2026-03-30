import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from './entities/listing.entity';
import { ListingVersion } from './entities/listing-version.entity';
import { ListingService } from './listing.service';
import { ListingVersionService } from './listing-version.service';
import { ListingController } from './listing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, ListingVersion])],
  providers: [ListingService, ListingVersionService],
  controllers: [ListingController],
  exports: [ListingService, ListingVersionService],
})
export class ListingVersionModule {}
