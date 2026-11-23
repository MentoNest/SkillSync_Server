import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AUTH_CONFIG, buildAuthConfig } from '../auth/auth.types';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../common/storage/storage.module';
import { ChatPresence } from './chat-presence';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { WsAuthService } from './ws-auth.service';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRoom } from './entities/chat-room.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoom, ChatMessage]),
    AuthModule,
    JwtModule.register({}),
    StorageModule,
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    ChatPresence,
    WsAuthService,
    {
      provide: AUTH_CONFIG,
      useFactory: () => buildAuthConfig((key) => process.env[key]),
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}
