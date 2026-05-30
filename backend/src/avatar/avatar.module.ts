import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AvatarService } from './avatar.service';
import { AvatarController } from './avatar.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AvatarController],
  providers: [AvatarService],
})
export class AvatarModule {}
