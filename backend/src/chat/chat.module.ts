import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatMessage } from './chat-message.entity.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatController } from './chat.controller.js';
import { RedisService } from '../services/redis.service.js';
import { getJwtSecret } from '../config/production-security.config.js';

/**
 * #1362: real-time chat. The gateway reads `sessions` through the entity
 * manager for membership checks, so only ChatMessage needs registering here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage]),
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
