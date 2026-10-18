import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioLink } from './portfolio-links/entities/portfolio-link.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { User } from './entities/user.entity';
import { UserSuspension } from './suspension/entities/user-suspension.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile, PortfolioLink])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
