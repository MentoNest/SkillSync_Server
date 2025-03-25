import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
// import { Session } from './entities/session.entity';
import { Session } from './entities/sessions.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Session])], // Register Session entity
  controllers: [SessionsController], // Register controller
  providers: [SessionsService], // Register service
  exports: [SessionsService], // Export for potential use in other modules
})
export class SessionsModule {}
