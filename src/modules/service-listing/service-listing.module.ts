import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceListingController } from './service-listing.controller';
import { ServiceListingService } from './service-listing.service';
import { ServiceListing } from './entities/service-listing.entity';
import { TagModule } from '../tag/tag.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceListing]), TagModule],
  controllers: [ServiceListingController],
  providers: [ServiceListingService, RolesGuard],
  exports: [ServiceListingService],
})
export class ServiceListingModule {}
