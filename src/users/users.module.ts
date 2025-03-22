import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './providers/user.service';
import { UserController } from './user.controller';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RedisModule], // Combined imports properly
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
