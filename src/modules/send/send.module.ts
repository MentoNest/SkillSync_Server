import { Module } from '@nestjs/common';
import { SendController } from './send.controller';
import { SendService } from './providers/send.service';
import { FeeService } from './providers/fee.service';
import { PinService } from './providers/pin.service';
import { TransfersService } from './providers/transfers.service';
import { ConfirmRateLimitGuard } from './confirm-rate-limit.guard';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UserModule, AuthModule],
  controllers: [SendController],
  providers: [SendService, FeeService, PinService, TransfersService, ConfirmRateLimitGuard],
  exports: [TransfersService],
})
export class SendModule {}
