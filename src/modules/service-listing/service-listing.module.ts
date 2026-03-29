import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ServiceListingController } from './service-listing.controller';
import { ServiceListingService } from './service-listing.service';
import { TrendingService } from './providers/trending.service';
import { RecommendationService } from './providers/recommendation.service';
import { ServiceListing } from './entities/service-listing.entity';
import { UserBehavior } from './entities/user-behavior.entity';
import { TagModule } from '../tag/tag.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListingOwnershipGuard } from './guards/listing-ownership.guard';
import { FileUploadService } from '../profile/providers/file-upload.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceListing, UserBehavior]),
    TagModule,
    MulterModule.register({
      dest: './uploads/listing-images',
    }),
    ConfigModule,
  ],
  controllers: [ServiceListingController],
  providers: [ServiceListingService, TrendingService, RecommendationService, RolesGuard, ListingOwnershipGuard, FileUploadService],
  exports: [ServiceListingService, TrendingService, RecommendationService],
})
export class ServiceListingModule {}
