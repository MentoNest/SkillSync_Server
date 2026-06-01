import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.verifyAccessToken(token);
      client.data.user = payload;
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data?.user as JwtPayload | undefined;
    if (user) {
      await this.chatService.redisService.del(`user_socket:${user.sub}`);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user as JwtPayload;
    if (!user) return { error: 'Unauthorized' };

    try {
      await this.chatService.validateSessionAccess(data.sessionId, user.sub);
      await client.join(data.sessionId);
      await this.chatService.redisService.set(`user_socket:${user.sub}`, client.id, 3600);
      return { success: true, sessionId: data.sessionId };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to join session' };
    }
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user as JwtPayload;
    if (!user) return { error: 'Unauthorized' };

    await client.leave(data.sessionId);
    return { success: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { sessionId: string; content: string; fileUrl?: string; fileName?: string; fileType?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user as JwtPayload;
    if (!user) return { error: 'Unauthorized' };

    const allowed = await this.chatService.checkRateLimit(user.sub);
    if (!allowed) {
      return { error: 'Rate limit exceeded. Maximum 10 messages per minute.' };
    }

    try {
      const message = await this.chatService.sendMessage(
        data.sessionId,
        user.sub,
        data.content,
        data.fileUrl,
        data.fileName,
        data.fileType,
      );

      client.to(data.sessionId).emit('new_message', {
        id: message.id,
        sessionId: message.sessionId,
        senderId: message.senderId,
        content: message.content,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileType: message.fileType,
        createdAt: message.createdAt,
      });

      const session = await this.chatService.getSession(data.sessionId);
      const otherUserId = session.mentorId === user.sub ? session.menteeId : session.mentorId;
      const otherSocketId = await this.chatService.getSocketId(otherUserId);

      if (!otherSocketId) {
        this.logger.log(`Push notification placeholder for offline user ${otherUserId}`);
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to send message' };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { sessionId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user as JwtPayload;
    if (!user) return;

    client.to(data.sessionId).emit('typing', {
      userId: user.sub,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('read_message')
  async handleReadMessage(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user as JwtPayload;
    if (!user) return;

    try {
      const message = await this.chatService.markAsRead(data.messageId, user.sub);

      client.to(message.sessionId).emit('message_read', {
        messageId: data.messageId,
        readBy: user.sub,
      });

      return { success: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to mark as read' };
    }
  }

  private verifyAccessToken(token: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');

    const [encodedHeader, encodedPayload, signature] = parts;

    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid token');
    }

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new Error('Invalid token');
    }

    const secret = this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'development-only-change-me';

    const expected = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (!this.safeEquals(expected, signature)) {
      throw new Error('Invalid token signature');
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid token');
    }

    if (payload.typ !== 'access') throw new Error('Invalid token type');
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }

    return payload;
  }

  private safeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i] ^ bufB[i];
    }
    return result === 0;
  }
}