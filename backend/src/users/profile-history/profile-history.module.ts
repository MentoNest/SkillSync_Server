import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileHistory } from './entities/profile-history.entity';
import { ProfileHistoryController } from './profile-history.controller';
import { ProfileHistoryService } from './profile-history.service';
import { ProfileHistorySubscriber } from './profile-history.subscriber';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileHistory])],
  controllers: [ProfileHistoryController],
  providers: [ProfileHistoryService, ProfileHistorySubscriber],
  exports: [ProfileHistoryService],
})
export class ProfileHistoryModule {}
