import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { DeprecationMiddleware } from './common/versioning/deprecation.middleware';
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
import { EncryptionModule } from './common/encryption/encryption.module';
import { BackupModule } from './backup/backup.module';
import { SeedModule } from './database/seed/seed.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsModule } from './metrics/metrics.module';
import { SessionsModule } from './sessions/sessions.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    MetricsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeormConfig),
    CacheModule.register(cacheConfig),
    EncryptionModule,
    RedisModule,
    AuthModule,
    BackupModule,
    SeedModule,
    AdminModule,
    NotificationsModule,
    SessionsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, ShutdownService],
  exports: [ShutdownService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DeprecationMiddleware).forRoutes('*');
  }
}