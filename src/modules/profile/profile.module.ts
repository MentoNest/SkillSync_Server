import { Module } from '@nestjs/common';
import { ProfileService } from './providers/profile.service';
import { ProfileController } from './profile.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService, RolesGuard],
})
export class ProfileModule {}
