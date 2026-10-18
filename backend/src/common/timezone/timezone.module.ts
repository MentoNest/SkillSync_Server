import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { TimezoneController } from './timezone.controller';
import { TimezoneService } from './timezone.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TimezoneController],
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
