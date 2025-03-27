import { Module } from '@nestjs/common';
import { SessionsService } from './providers/sessions.service';
import { SessionsController } from './sessions.controller';
import { Session } from './session.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
