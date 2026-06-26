import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { RedisModule } from '../redis/redis.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RedisModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
