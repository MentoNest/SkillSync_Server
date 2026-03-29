import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ServiceListingController } from './service-listing.controller';
import { ServiceListingService } from './service-listing.service';
import { ServiceListing } from './entities/service-listing.entity';
import { TagModule } from '../tag/tag.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListingOwnershipGuard } from './guards/listing-ownership.guard';
import { FileUploadService } from '../profile/providers/file-upload.service';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceListing]),
    TagModule,
    MulterModule.register({
      dest: './uploads/listing-images',
    }),
    ConfigModule,
    NotificationModule,
  ],
  controllers: [ServiceListingController],
  providers: [ServiceListingService, RolesGuard, ListingOwnershipGuard, FileUploadService],
  exports: [ServiceListingService],
})
export class ServiceListingModule {}
