import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceListingController } from './service-listing.controller';
import { ServiceListingService } from './service-listing.service';
import { ServiceListing } from './entities/service-listing.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceListing])],
  controllers: [ServiceListingController],
  providers: [ServiceListingService],
  exports: [ServiceListingService],
})
export class ServiceListingModule {}
