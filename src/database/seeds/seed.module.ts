import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminSeedService } from './admin-seed.service';
import { Role } from '../../modules/auth/entities/role.entity';
import { User } from '../../modules/auth/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, User]), ConfigModule],
  providers: [AdminSeedService],
  exports: [AdminSeedService],
})
export class SeedModule {}
