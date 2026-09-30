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
import { Repository, LessThan } from 'typeorm';
import { ChatMessage } from './chat-message.entity.js';
import { RedisService } from '../services/redis.service.js';

/**
 * #1362: real-time chat gateway.
 *
 * Design notes:
 *  - Every connection is authenticated with the JWT access token (same
 *    contract as the REST API); unauthenticated handshakes are rejected.
 *  - Each mentorship session gets a room (`session:<id>`); only the session's
 *    mentor and mentee may join, send into it, or read its history. Messages
 *    without a session stay direct 1:1 messages between the two users.
 *  - Message sending is rate limited to 10 messages per minute via the shared
 *    Redis sliding-window limiter (in-memory fallback when Redis is down).
 */
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
  private readonly RATE_LIMIT = 10;
  private readonly RATE_WINDOW_SECONDS = 60;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const headerToken =
        client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      const token = (client.handshake.auth?.token as string | undefined) ?? headerToken;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload.id;
      client.data.userId = userId;
      this.onlineUsers.set(userId, client.id);

      client.emit('connected', { userId, socketId: client.id });
      this.logger.log(`User ${userId} connected`);
    } catch {
      this.logger.warn('WebSocket connection rejected: invalid token');
      client.disconnect(true);
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

  /**
   * #1362: join a session chat room. Only the session's mentor and mentee are
   * allowed in, so rooms stay scoped to the mentorship pairing.
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return { ok: false, error: 'not_authenticated' };
    if (!data?.sessionId) return { ok: false, error: 'session_required' };

    if (!(await this.isSessionMember(data.sessionId, userId))) {
      return { ok: false, error: 'not_a_session_member' };
    }

    const room = this.sessionRoom(data.sessionId);
    await client.join(room);
    client.emit('room_joined', { room });
    return { ok: true, room };
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (!data?.sessionId) return { ok: false, error: 'session_required' };

    const room = this.sessionRoom(data.sessionId);
    await client.leave(room);
    return { ok: true, room };
  }

  /**
   * #1362: conversation history for a session room, newest last so clients
   * can append in order. Paginated with a `before` (ISO) cursor and `limit`.
   */
  @SubscribeMessage('get_history')
  async handleGetHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; before?: string; limit?: number },
  ) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return { ok: false, error: 'not_authenticated' };
    if (!data?.sessionId) return { ok: false, error: 'session_required' };
    if (!(await this.isSessionMember(data.sessionId, userId))) {
      return { ok: false, error: 'not_a_session_member' };
    }

    const limit = Math.min(Math.max(data.limit ?? 50, 1), 100);
    const qb = this.messageRepository
      .createQueryBuilder('message')
      .where('message.sessionId = :sessionId', { sessionId: data.sessionId })
      .orderBy('message.createdAt', 'DESC')
      .take(limit);

    if (data.before) {
      qb.andWhere('message.createdAt < :before', { before: new Date(data.before) });
    }

    const messages = await qb.getMany();
    return { ok: true, messages: messages.reverse() };
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

    // #1362: rate limit — 10 messages per minute per user.
    const { isLimited } = await this.redisService.checkRateLimit(
      `chat:rate:${senderId}`,
      this.RATE_LIMIT,
      this.RATE_WINDOW_SECONDS,
    );
    if (isLimited) {
      client.emit('error', {
        message: 'Rate limit exceeded. Maximum 10 messages per minute.',
      });
      return;
    }

    // Session rooms are member-only: a sender may not inject messages into a
    // session they do not participate in.
    if (data.sessionId && !(await this.isSessionMember(data.sessionId, senderId))) {
      client.emit('error', { message: 'You are not a member of this session' });
      return;
    }

    const message = this.messageRepository.create({
      senderId,
      receiverId: data.receiverId,
      sessionId: data.sessionId ?? null,
      content: data.content,
      fileUrl: data.fileUrl ?? null,
      fileType: data.fileType ?? null,
    });

    const saved = await this.messageRepository.save(message);

    const receiverSocketId = this.onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('new_message', saved);
    } else {
      // #1362: push notification placeholder for offline recipients. A real
      // integration (FCM/APNs/web-push) hooks in here; the delivery intent is
      // logged so the contract stays visible end to end.
      this.logger.log(
        `[Push Placeholder] offline user ${data.receiverId} has a new message (${saved.id}) from ${senderId}`,
      );
    }

    if (data.sessionId) {
      this.server.to(this.sessionRoom(data.sessionId)).emit('new_message', saved);
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

  /** #1362: unread message count for the current user (REST surface). */
  async getUnreadCount(userId: string): Promise<number> {
    return this.messageRepository.count({
      where: { receiverId: userId, isRead: false },
    });
  }

  /**
   * #1362: unread counts grouped by conversation partner so a client can
   * render per-conversation badges with a single call.
   */
  async getUnreadCountsByPartner(
    userId: string,
  ): Promise<Array<{ partnerId: string; count: number }>> {
    const rows = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.senderId', 'partnerId')
      .addSelect('COUNT(*)', 'count')
      .where('message.receiverId = :userId', { userId })
      .andWhere('message.isRead = false')
      .groupBy('message.senderId')
      .getRawMany<{ partnerId: string; count: string }>();

    return rows.map((row) => ({ partnerId: row.partnerId, count: Number(row.count) }));
  }

  /**
   * #1362: retention helper for conversation history — messages older than
   * the given number of days can be purged by an ops job.
   */
  async deleteMessagesOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.messageRepository.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  /**
   * Membership check: only the session's mentor and mentee may join its room,
   * read its history, or send into it.
   */
  private async isSessionMember(sessionId: string, userId: string): Promise<boolean> {
    const membership = await this.messageRepository.manager
      .createQueryBuilder()
      .select('1')
      .from('sessions', 'session')
      .where('session.id = :sessionId', { sessionId })
      .andWhere('(session."mentorId" = :userId OR session."menteeId" = :userId)', {
        userId,
      })
      .getRawOne();
    return Boolean(membership);
  }

  private sessionRoom(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
