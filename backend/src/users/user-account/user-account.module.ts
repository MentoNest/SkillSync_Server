import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { AdminUserAccountController } from './admin-user-account.controller';
import { UserAccountController } from './user-account.controller';
import { UserAccountService } from './user-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile])],
  controllers: [UserAccountController, AdminUserAccountController],
  providers: [UserAccountService],
  exports: [UserAccountService],
})
export class UserAccountModule {}
