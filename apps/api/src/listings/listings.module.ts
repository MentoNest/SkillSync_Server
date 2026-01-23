import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsService } from './listings.service';
import { MentorListingsController } from './mentor-listings.controller';
import { PublicListingsController } from './public-listings.controller';
import { Listing } from './entities/listing.entity';
import { Skill } from '../skills/entities/skill.entity';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, Skill, MentorProfile])],
  controllers: [MentorListingsController, PublicListingsController],
  providers: [ListingsService],
  exports: [TypeOrmModule],
})
export class ListingsModule {}
