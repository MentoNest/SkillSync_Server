import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { ListingService } from './listings/listings.service';
import { ListingController } from './listings/mentor-listings.controller';

@Module({
  imports: [DatabaseModule, HealthModule],
  controllers: [AppController, ListingController],
  providers: [AppService, ListingService],
})
export class AppModule {}
