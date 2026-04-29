import { Module, Global } from '@nestjs/common';
import { ShutdownService } from './shutdown.service';
import { RedisModule } from '../../redis/redis.module';
import { AppConfigModule } from '../../config/app-config.module';

@Global()
@Module({
  imports: [AppConfigModule, RedisModule],
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
