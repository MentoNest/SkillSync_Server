import { Module, DynamicModule, Global } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { RedisService } from './redis.service';

@Global()
@Module({})
export class RedisModule {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      imports: [AppConfigModule],
      providers: [RedisService],
      exports: [RedisService],
    };
  }

  static forRootAsync(options: {
    imports?: any[];
  }): DynamicModule {
    return {
      module: RedisModule,
      imports: options.imports || [AppConfigModule],
      providers: [RedisService],
      exports: [RedisService],
    };
  }
}
