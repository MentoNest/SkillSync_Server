import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityModule } from '../availability/availability.module';
import { PaginationService } from '../common/pagination/pagination.service';
import { Session } from './entities/session.entity';
import { ReminderScheduler } from './reminder.scheduler';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session]),
    AuthModule,
    AvailabilityModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, ReminderScheduler, PaginationService],
  exports: [SessionsService],
})
export class SessionsModule {}
