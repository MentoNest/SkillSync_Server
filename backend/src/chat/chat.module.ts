import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MentorshipSession } from './entities/mentorship-session.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MentorshipSession, ChatRoom, Message, MessageAttachment]),
    RedisModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const algorithm = config.get('JWT_ALGORITHM') || (config.get('JWT_PRIVATE_KEY') ? 'RS256' : 'HS256');
        const secret =
          algorithm === 'RS256' ? config.get<string>('JWT_PUBLIC_KEY') : config.get<string>('JWT_SECRET');
        return { secret };
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
