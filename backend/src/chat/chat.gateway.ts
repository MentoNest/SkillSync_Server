import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service.js';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers = new Map<string, string>(); // clientId -> userId

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket): void {
    const userId = client.handshake.auth?.userId;
    if (userId) {
      this.connectedUsers.set(client.id, userId);
      this.logger.log(`User ${userId} connected (socket: ${client.id})`);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      this.connectedUsers.delete(client.id);
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ): void {
    client.join(`session:${data.sessionId}`);
    this.logger.log(`Client ${client.id} joined room session:${data.sessionId}`);
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; content: string; type?: string },
  ): Promise<void> {
    const senderId = this.connectedUsers.get(client.id);
    if (!senderId) return;

    const message = await this.chatService.sendMessage(
      data.sessionId,
      senderId,
      data.content,
      (data.type as any) || 'text',
    );

    this.server
      .to(`session:${data.sessionId}`)
      .emit('new-message', message);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; isTyping: boolean },
  ): void {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    client.to(`session:${data.sessionId}`).emit('typing', {
      userId,
      sessionId: data.sessionId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('read-receipt')
  handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; messageIds: string[] },
  ): void {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.server.to(`session:${data.sessionId}`).emit('read-receipt', {
      userId,
      sessionId: data.sessionId,
      messageIds: data.messageIds,
    });
  }
}
