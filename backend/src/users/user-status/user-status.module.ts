import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UserStatusController } from './user-status.controller';
import { UserStatusService } from './user-status.service';
import { RolesGuard } from '../../rbac/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserStatusController],
  providers: [UserStatusService, RolesGuard],
  exports: [UserStatusService],
})
export class UserStatusModule {}
