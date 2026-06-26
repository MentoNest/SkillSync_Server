import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { RedisService } from '../redis/redis.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { JwtAccessTokenPayload } from '../jwt-payload.interface';
import { MessageType } from './entities/message.entity';

const MSG_RATE_LIMIT = 10;
const MSG_RATE_WINDOW_SECONDS = 60;
const ONLINE_KEY_PREFIX = 'wsOnline';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const raw = process.env.CORS_ALLOWED_ORIGINS || '';
      const whitelist = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!origin) return callback(null, true);
      return callback(null, whitelist.includes(origin));
    },
    credentials: true,
  },
  namespace: '/chat',
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket: Socket, next) => {
      try {
        const token =
          (socket.handshake.auth as Record<string, string>)?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
          (socket.handshake.query?.token as string);

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const secret = this.configService.get<string>('JWT_SECRET');
        const payload = await this.jwtService.verifyAsync<JwtAccessTokenPayload>(token, { secret });

        if (!payload?.sub || !payload?.wallet) {
          return next(new Error('Invalid token payload'));
        }

        // Verify token version to support server-side invalidation
        const storedVersion = await this.redisService.get(payload.sub, 'tokenVersion');
        const currentVersion = storedVersion ? Number(storedVersion) : 0;
        if (payload.ver !== currentVersion) {
          return next(new Error('Token version invalidated'));
        }

        socket.data.userId = payload.sub;
        socket.data.user = payload;
        next();
      } catch {
        next(new Error('Invalid or expired token'));
      }
    });
  }

  async handleConnection(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect();
      return;
    }

    this.logger.log(`Connected: socket=${client.id} user=${userId}`);
    await this.redisService.set(userId, '1', 0, ONLINE_KEY_PREFIX);

    const roomIds = await this.chatService.getUserRooms(userId);
    for (const roomId of roomIds) {
      client.to(roomId).emit('user_online', { userId, timestamp: new Date() });
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    this.logger.log(`Disconnected: socket=${client.id} user=${userId}`);
    await this.redisService.del(userId, ONLINE_KEY_PREFIX);

    const roomIds = await this.chatService.getUserRooms(userId);
    for (const roomId of roomIds) {
      client.to(roomId).emit('user_offline', { userId, timestamp: new Date() });
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const userId = client.data.userId as string;

    const room = await this.chatService.getRoomForSession(dto.sessionId);
    if (!room) {
      throw new WsException('Room not found');
    }

    const hasAccess = await this.chatService.userHasRoomAccess(userId, room.id);
    if (!hasAccess) {
      throw new WsException('Access denied to this room');
    }

    await client.join(room.id);

    const history = await this.chatService.getMessageHistory(room.id, dto.limit ?? 50, dto.before);

    client.emit('room_joined', { roomId: room.id, history });
    return { success: true, roomId: room.id };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const userId = client.data.userId as string;

    const withinLimit = await this.checkRateLimit(userId);
    if (!withinLimit) {
      throw new WsException(`Rate limit exceeded: ${MSG_RATE_LIMIT} messages per minute`);
    }

    const room = await this.chatService.getRoom(dto.roomId);
    if (!room) {
      throw new WsException('Room not found');
    }

    const hasAccess = await this.chatService.userHasRoomAccess(userId, dto.roomId);
    if (!hasAccess) {
      throw new WsException('Access denied to this room');
    }

    if (!dto.content && !dto.attachments?.length) {
      throw new WsException('Message must have content or attachments');
    }

    const message = await this.chatService.saveMessage({
      roomId: dto.roomId,
      senderId: userId,
      content: dto.content,
      messageType: dto.attachments?.length ? MessageType.FILE : (dto.messageType ?? MessageType.TEXT),
      attachments: dto.attachments,
    });

    this.server.to(dto.roomId).emit('message', message);

    await this.notifyOfflineUsers(room.session.mentorId, room.session.menteeId, userId, message);

    return { success: true, messageId: message.id };
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!data?.roomId) throw new WsException('roomId is required');
    client.to(data.roomId).emit('typing', { userId: client.data.userId, isTyping: true });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!data?.roomId) throw new WsException('roomId is required');
    client.to(data.roomId).emit('typing', { userId: client.data.userId, isTyping: false });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MarkReadDto,
  ) {
    const userId = client.data.userId as string;

    const hasAccess = await this.chatService.userHasRoomAccess(userId, dto.roomId);
    if (!hasAccess) {
      throw new WsException('Access denied to this room');
    }

    await this.chatService.markMessagesRead(dto.roomId, userId, dto.messageIds);

    client.to(dto.roomId).emit('message_read', {
      readBy: userId,
      messageIds: dto.messageIds ?? null,
      readAt: new Date(),
    });

    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string;
    if (userId) {
      // Refresh online TTL on heartbeat (set with no-expire, this is a no-op refresh)
      this.redisService.set(userId, '1', 0, ONLINE_KEY_PREFIX).catch(() => {});
    }
    return { pong: true, timestamp: new Date() };
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const val = await this.redisService.get(userId, ONLINE_KEY_PREFIX);
    return val === '1';
  }

  private async checkRateLimit(userId: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const key = `msgRate:${userId}`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, MSG_RATE_WINDOW_SECONDS);
    }
    return count <= MSG_RATE_LIMIT;
  }

  private async notifyOfflineUsers(
    mentorId: string,
    menteeId: string,
    senderId: string,
    message: { id: string; content: string | null },
  ): Promise<void> {
    const recipientId = senderId === mentorId ? menteeId : mentorId;
    const isOnline = await this.isUserOnline(recipientId);

    if (!isOnline) {
      // Push notification placeholder — integrate with FCM/APNs/web-push here
      this.logger.log(
        `[PUSH_NOTIFICATION] User ${recipientId} is offline — would send push for message ${message.id}`,
      );
      // Example integration point:
      // await this.pushNotificationService.send(recipientId, {
      //   title: 'New message',
      //   body: message.content ?? 'You have a new file attachment',
      //   data: { messageId: message.id },
      // });
    }
  }
}
