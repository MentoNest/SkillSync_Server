import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsService } from './listings.service';
import { MentorListingsController } from './mentor-listings.controller';
import { PublicListingsController } from './public-listings.controller';
import { Listing } from './entities/listing.entity';
import { Skill } from '../skills/entities/skill.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, Skill])],
  controllers: [MentorListingsController, PublicListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}