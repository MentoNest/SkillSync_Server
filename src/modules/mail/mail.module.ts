import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigModule } from '../../config/config.module';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
