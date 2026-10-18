import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UsernameController } from './username.controller';
import { UsernameService } from './username.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsernameController],
  providers: [UsernameService],
  exports: [UsernameService],
})
export class UsernameModule {}
