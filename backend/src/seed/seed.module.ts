import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSeedService } from './admin-seed.service';
import { User } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';

/**
 * #1319: bootstrap seeding.
 *
 * `AdminSeedService` implements `OnApplicationBootstrap`, so importing this
 * module into `AppModule` is enough to have the roles and the bootstrap
 * administrator in place before the server starts listening.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Role])],
  providers: [AdminSeedService],
  exports: [AdminSeedService],
})
export class SeedModule {}
