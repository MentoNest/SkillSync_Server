import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import typeormConfig from './config/typeorm.config';

import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth.module';
import { UsersModule } from './users/users.module';

import { CacheModule } from '@nestjs/cache-manager';
import cacheConfig from './config/cache.config';
import { ShutdownService } from './shutdown/shutdown.service';
import { EncryptionModule } from './common/encryption/encryption.module';
import { BackupModule } from './backup/backup.module';
import { SeedModule } from './database/seed/seed.module';
import { SessionsModule } from './sessions/sessions.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeormConfig),
    CacheModule.register(cacheConfig),
    EncryptionModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BackupModule,
    SeedModule,
    SessionsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, ShutdownService],
  exports: [ShutdownService],
})
export class AppModule {}