import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mentee } from './mentee.entity';
import { MenteeService } from './providers/mentee.service';
import { MenteeController } from './mentee.controller';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mentee]), RedisModule],
  controllers: [MenteeController],
  providers: [MenteeService],
  exports: [MenteeService],
})
export class MenteeModule {}
