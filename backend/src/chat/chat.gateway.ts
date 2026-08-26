import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { User } from '../user/entities/user.entity';
import { RedisService } from '../services/redis.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly onlineUsers = new Map<string, string>(); // userId -> socketId
  private readonly typingUsers = new Map<string, Set<string>>(); // roomId -> Set<userId>
  private readonly RATE_LIMIT = 10;
  private readonly RATE_WINDOW_MS = 60000;
  private readonly messageTimestamps = new Map<string, number[]>();

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload.id;
      client.data.userId = userId;
      this.onlineUsers.set(userId, client.id);

      client.emit('connected', { userId, socketId: client.id });
      this.logger.log(`User ${userId} connected`);
    } catch (error) {
      this.logger.warn('WebSocket connection rejected: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      this.onlineUsers.delete(userId);
      this.server.emit('user_offline', { userId });
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      receiverId: string;
      content: string;
      sessionId?: string;
      fileUrl?: string;
      fileType?: string;
    },
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    if (!this.checkRateLimit(senderId)) {
      client.emit('error', { message: 'Rate limit exceeded. Maximum 10 messages per minute.' });
      return;
    }

    const message = this.messageRepository.create({
      senderId,
      receiverId: data.receiverId,
      sessionId: data.sessionId,
      content: data.content,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
    });

    const saved = await this.messageRepository.save(message);

    const receiverSocketId = this.onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('new_message', saved);
    }

    client.emit('message_sent', saved);
    return saved;
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const receiverSocketId = this.onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('user_typing', { userId, isTyping: true });
    }
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const receiverSocketId = this.onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('user_typing', { userId, isTyping: false });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    await this.messageRepository.update(
      { id: data.messageId, receiverId: userId },
      { isRead: true },
    );

    client.emit('message_read', { messageId: data.messageId });
  }

  @SubscribeMessage('get_online_status')
  handleGetOnlineStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const statuses = data.userIds.map((id) => ({
      userId: id,
      isOnline: this.onlineUsers.has(id),
    }));

    client.emit('online_status', statuses);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.messageRepository.count({
      where: { receiverId: userId, isRead: false },
    });
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(userId) || [];
    const windowStart = now - this.RATE_WINDOW_MS;
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= this.RATE_LIMIT) {
      return false;
    }

    recent.push(now);
    this.messageTimestamps.set(userId, recent);
    return true;
  }
}
