import { Module } from '@nestjs/common';
import { RatingsService } from './providers/ratings.service';
import { RatingsController } from './ratings.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [RatingsController],
  providers: [RatingsService, RolesGuard],
})
export class RatingsModule {}
