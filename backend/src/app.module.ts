import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import typeormConfig from './config/typeorm.config';

import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth.module';

import { CacheModule } from '@nestjs/cache-manager';
import cacheConfig from './config/cache.config';
import { ShutdownService } from './shutdown/shutdown.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeormConfig),
    CacheModule.register(cacheConfig),
    RedisModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, ShutdownService],
  exports: [ShutdownService],
})
export class AppModule {}