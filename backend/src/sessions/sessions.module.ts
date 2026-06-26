import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
