import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Session } from '../sessions/entities/session.entity';
import { LocalStorageService, S3StorageService, StorageService } from '../users/avatar/storage.service';
import { ChatPresence } from './chat-presence';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { WsAuthService } from './ws-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoom, ChatMessage, Session]),
    // Verification options are passed per call, mirroring JwtAuthGuard.
    JwtModule.register({}),
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    ChatPresence,
    WsAuthService,
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService =>
        (config.get<string>('STORAGE_DRIVER') ?? 'local') === 's3'
          ? new S3StorageService(config)
          : new LocalStorageService(config, {
              dir: config.get<string>('CHAT_UPLOAD_DIR') ?? 'uploads/chat',
              publicPath: config.get<string>('CHAT_UPLOAD_PUBLIC_PATH') ?? '/uploads/chat',
            }),
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}
