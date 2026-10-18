import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UserSuspension } from './entities/user-suspension.entity';
import { SuspensionController } from './suspension.controller';
import { SuspensionService } from './suspension.service';
import { RolesGuard } from '../../rbac/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSuspension])],
  controllers: [SuspensionController],
  providers: [SuspensionService, RolesGuard],
  exports: [SuspensionService],
})
export class SuspensionModule {}
