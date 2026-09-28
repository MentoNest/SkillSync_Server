import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSeedService } from './admin-seed.service.js';
import { DemoSeedService } from './demo-seed.service.js';
import { User } from '../user/entities/user.entity.js';
import { Role } from '../entities/role.entity.js';

/**
 * #1319: bootstrap seeding.
 *
 * `AdminSeedService` implements `OnApplicationBootstrap`, so importing this
 * module into `AppModule` is enough to have the roles and the bootstrap
 * administrator in place before the server starts listening.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Role])],
  providers: [AdminSeedService, DemoSeedService],
  exports: [AdminSeedService, DemoSeedService],
})
export class SeedModule {}
