import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatMessage } from './chat-message.entity.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatController } from './chat.controller.js';
import { User } from '../user/entities/user.entity.js';
import { RedisService } from '../services/redis.service.js';
import { getJwtSecret } from '../config/production-security.config.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, User]),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, RedisService],
  exports: [ChatGateway],
})
export class ChatModule {}
