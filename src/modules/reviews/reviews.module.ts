import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './providers/reviews.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Review } from './entities/review.entity';
import { ServiceListing } from '../service-listing/entities/service-listing.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Review, ServiceListing])],
  controllers: [ReviewsController],
  providers: [ReviewsService, RolesGuard],
})
export class ReviewsModule {}
