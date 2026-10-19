import { HttpException, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { resolveAllowedOrigins } from '../config/cors.config';
import { ChatPresence } from './chat-presence';
import { ChatService, otherParticipant, ReadReceipt } from './chat.service';
import { ChatEvents, roomChannel, userChannel } from './chat.types';
import { RoomRefDto, SendMessageDto, TypingDto } from './dto/chat.dto';
import type { ChatMessage } from './entities/chat-message.entity';
import { WsAuthService } from './ws-auth.service';

/** Every handler acknowledges with `{ ok: true, ... }` or `{ ok: false, status, error }`. */
export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

async function ack<T extends object>(work: () => Promise<T>): Promise<Ack<T>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (err) {
    if (err instanceof HttpException) {
      const response = err.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response ? (response as { message: unknown }).message : err.message;
      return { ok: false, status: err.getStatus(), error: String(message) };
    }
    if (err instanceof WsException) return { ok: false, status: 400, error: String(err.getError()) };
    throw err;
  }
}

const userOf = (client: Socket): JwtPayload => client.data.user as JwtPayload;

/**
 * Real-time chat (issue #1475) on the `/chat` namespace.
 *
 * Connect with `io('/chat', { auth: { token: '<access token>' } })`. Messages
 * reach both participants through their personal `user:<id>` channels, so a
 * client only needs to `room:join` a room to see typing indicators in it.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: resolveAllowedOrigins(process.env.CORS_ORIGINS, process.env.NODE_ENV), credentials: true },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException(errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') || 'Invalid payload'),
  }),
)
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly chat: ChatService,
    private readonly auth: WsAuthService,
    private readonly presence: ChatPresence,
  ) {}

  /** JWT check during the handshake: unauthenticated sockets never connect. */
  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.auth
        .authenticate(socket.handshake)
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch((err: Error) => next(new Error(err.message)));
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = userOf(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    await client.join(userChannel(user.sub));
    if (this.presence.connect(user.sub)) await this.broadcastPresence(user.sub, true);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = userOf(client);
    if (user && this.presence.disconnect(user.sub)) await this.broadcastPresence(user.sub, false);
  }

  @SubscribeMessage(ChatEvents.JOIN_ROOM)
  join(@ConnectedSocket() client: Socket, @MessageBody() dto: RoomRefDto) {
    return ack(async () => {
      const userId = userOf(client).sub;
      const room = await this.chat.getRoomFor(userId, dto.roomId);
      await client.join(roomChannel(room.id));
      return { roomId: room.id, participantOnline: this.presence.isOnline(otherParticipant(room, userId)) };
    });
  }

  @SubscribeMessage(ChatEvents.LEAVE_ROOM)
  leave(@ConnectedSocket() client: Socket, @MessageBody() dto: RoomRefDto) {
    return ack(async () => {
      await client.leave(roomChannel(dto.roomId));
      return { roomId: dto.roomId };
    });
  }

  @SubscribeMessage(ChatEvents.SEND_MESSAGE)
  send(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    return ack(async () => {
      const { message, recipientId } = await this.chat.sendMessage(userOf(client).sub, dto.roomId, dto.body);
      this.broadcastMessage(message, recipientId);
      return { message };
    });
  }

  @SubscribeMessage(ChatEvents.MARK_READ)
  markRead(@ConnectedSocket() client: Socket, @MessageBody() dto: RoomRefDto) {
    return ack(async () => {
      const receipt = await this.chat.markRead(userOf(client).sub, dto.roomId);
      this.broadcastReadReceipt(receipt);
      return { receipt };
    });
  }

  /** Typing indicator, relayed to the others in the room without touching the database. */
  @SubscribeMessage(ChatEvents.TYPING)
  typing(@ConnectedSocket() client: Socket, @MessageBody() dto: TypingDto) {
    return ack(async () => {
      const channel = roomChannel(dto.roomId);
      if (!client.rooms.has(channel)) throw new WsException('Join the room first');
      client.to(channel).emit(ChatEvents.TYPING, {
        roomId: dto.roomId,
        userId: userOf(client).sub,
        isTyping: dto.isTyping,
      });
      return {};
    });
  }

  /** Online status of the caller's chat partners. */
  @SubscribeMessage(ChatEvents.PRESENCE_QUERY)
  presenceQuery(@ConnectedSocket() client: Socket) {
    return ack(async () => {
      const partners = await this.chat.partnerIds(userOf(client).sub);
      return { online: Object.fromEntries(partners.map((id) => [id, this.presence.isOnline(id)])) };
    });
  }

  /** Delivers a stored message to both participants (all their open sockets). */
  broadcastMessage(message: ChatMessage, recipientId: string): void {
    this.server
      .to([roomChannel(message.roomId), userChannel(recipientId), userChannel(message.senderId)])
      .emit(ChatEvents.NEW_MESSAGE, message);
  }

  broadcastReadReceipt(receipt: ReadReceipt): void {
    if (receipt.updated === 0) return;
    this.server
      .to([roomChannel(receipt.roomId), userChannel(receipt.participantId)])
      .emit(ChatEvents.READ_RECEIPT, receipt);
  }

  private async broadcastPresence(userId: string, online: boolean): Promise<void> {
    try {
      const partners = await this.chat.partnerIds(userId);
      if (partners.length === 0) return;
      this.server.to(partners.map(userChannel)).emit(ChatEvents.PRESENCE, { userId, online });
    } catch (err) {
      this.logger.warn(`Presence update for ${userId} failed: ${(err as Error).message}`);
    }
  }
}
