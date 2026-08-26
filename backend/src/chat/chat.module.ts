import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatMessage } from './chat-message.entity';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { User } from '../user/entities/user.entity';
import { RedisService } from '../services/redis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, RedisService],
  exports: [ChatGateway],
})
export class ChatModule {}
