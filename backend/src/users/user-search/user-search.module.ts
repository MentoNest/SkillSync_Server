import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { UserSearchController } from './user-search.controller';
import { UserSearchService } from './user-search.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile])],
  controllers: [UserSearchController],
  providers: [UserSearchService],
  exports: [UserSearchService],
})
export class UserSearchModule {}
