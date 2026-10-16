import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from './entities/role.entity';
import { RbacService } from './rbac.service';
import { RolesGuard } from './roles.guard';
import { SeedService } from './seed.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, User])],
  providers: [RbacService, RolesGuard, SeedService],
  exports: [RbacService, RolesGuard],
})
export class RbacModule {}
