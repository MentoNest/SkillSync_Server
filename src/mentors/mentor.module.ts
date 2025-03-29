import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mentor } from './mentor.entity';
import { MentorService } from './providers/mentor.service';
import { MentorController } from './mentor.controller';
import { RedisModule } from 'src/common/redis/redis.module';
import { UserModule } from 'src/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mentor]), RedisModule, UserModule],
  providers: [MentorService],
  controllers: [MentorController],
  exports: [MentorService],
})
export class MentorModule {}
