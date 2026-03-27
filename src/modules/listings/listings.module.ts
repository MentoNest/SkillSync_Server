import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsService } from './providers/listings.service';
import { ListingsController } from './listings.controller';
import { Listing } from './entities/listing.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing]),
    AuthModule,
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
