import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerifyService } from './verify.service';
import { VerifyController } from './verify.controller';
import { WebhookController } from './webhook.controller';
import { Kyc } from './entities/kyc.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Kyc, User])],
  providers: [VerifyService],
  controllers: [VerifyController, WebhookController],
  exports: [VerifyService],
})
export class VerifyModule {}