import {
  HttpException,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
import type { CorsOptions } from 'cors';
import type { Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../auth/auth.types';
import { ChatPresence } from './chat-presence';
import { ChatService, otherParticipant } from './chat.service';
import type { ReadReceipt } from './chat.service';
import { ChatEvents, roomChannel, userChannel } from './chat.types';
import { RoomRefDto, SendMessageDto, TypingDto } from './dto/chat.dto';
import type { ChatMessage } from './entities/chat-message.entity';
import { WsAuthService } from './ws-auth.service';

export type Ack<T extends object = object> =
  ({ ok: true } & T) | { ok: false; status: number; error: string };

async function ack<T extends object>(
  work: () => T | Promise<T>,
): Promise<Ack<T>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response
          ? response.message
          : error.message;
      return { ok: false, status: error.getStatus(), error: String(message) };
    }
    if (error instanceof WsException) {
      const detail = error.getError();
      return {
        ok: false,
        status: 400,
        error: typeof detail === 'string' ? detail : JSON.stringify(detail),
      };
    }
    throw error;
  }
}

const chatCors: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const fallback = process.env.FRONTEND_DOMAIN ?? 'http://localhost:3000';
    callback(
      null,
      allowed.length > 0 ? allowed.includes(origin) : origin === fallback,
    );
  },
  credentials: true,
};

const userOf = (client: Socket): AuthUser =>
  (client.data as { user: AuthUser }).user;

@WebSocketGateway({ namespace: '/chat', cors: chatCors })
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException(
        errors
          .flatMap((error) => Object.values(error.constraints ?? {}))
          .join('; ') || 'Invalid payload',
      ),
  }),
)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server?: Namespace;

  constructor(
    private readonly chat: ChatService,
    private readonly auth: WsAuthService,
    private readonly presence: ChatPresence,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.auth
        .authenticate(socket.handshake)
        .then((user) => {
          (socket.data as { user?: AuthUser }).user = user;
          next();
        })
        .catch((error: Error) => next(error));
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = (client.data as { user?: AuthUser }).user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    await client.join(userChannel(user.address));
    if (this.presence.connect(user.address))
      await this.broadcastPresence(user.address, true);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = (client.data as { user?: AuthUser }).user;
    if (user && this.presence.disconnect(user.address)) {
      await this.broadcastPresence(user.address, false);
    }
  }

  @SubscribeMessage(ChatEvents.JOIN_ROOM)
  join(@ConnectedSocket() client: Socket, @MessageBody() dto: RoomRefDto) {
    return ack(async () => {
      const user = userOf(client);
      const room = await this.chat.getRoomFor(user.address, dto.roomId);
      await client.join(roomChannel(room.id));
      return {
        roomId: room.id,
        participantOnline: this.presence.isOnline(
          otherParticipant(room, user.address),
        ),
      };
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
      const { message, recipientId } = await this.chat.sendMessage(
        userOf(client).address,
        dto.roomId,
        dto.body,
      );
      this.broadcastMessage(message, recipientId);
      return { message };
    });
  }

  @SubscribeMessage(ChatEvents.MARK_READ)
  markRead(@ConnectedSocket() client: Socket, @MessageBody() dto: RoomRefDto) {
    return ack(async () => {
      const receipt = await this.chat.markRead(
        userOf(client).address,
        dto.roomId,
      );
      this.broadcastReadReceipt(receipt);
      return { receipt };
    });
  }

  @SubscribeMessage(ChatEvents.TYPING)
  typing(@ConnectedSocket() client: Socket, @MessageBody() dto: TypingDto) {
    return ack(() => {
      const channel = roomChannel(dto.roomId);
      if (!client.rooms.has(channel))
        throw new WsException('Join the room first');
      client.to(channel).emit(ChatEvents.TYPING, {
        roomId: dto.roomId,
        userId: userOf(client).address,
        isTyping: dto.isTyping,
      });
      return {};
    });
  }

  @SubscribeMessage(ChatEvents.PRESENCE_QUERY)
  presenceQuery(@ConnectedSocket() client: Socket) {
    return ack(async () => {
      const partners = await this.chat.partnerIds(userOf(client).address);
      return {
        online: Object.fromEntries(
          partners.map((id) => [id, this.presence.isOnline(id)]),
        ),
      };
    });
  }

  broadcastMessage(message: ChatMessage, recipientId: string): void {
    if (!this.server) return;
    this.server
      .to([
        roomChannel(message.roomId),
        userChannel(recipientId),
        userChannel(message.senderId),
      ])
      .emit(ChatEvents.NEW_MESSAGE, message);
  }

  broadcastReadReceipt(receipt: ReadReceipt): void {
    if (!this.server || receipt.updated === 0) return;
    this.server
      .to([roomChannel(receipt.roomId), userChannel(receipt.participantId)])
      .emit(ChatEvents.READ_RECEIPT, receipt);
  }

  private async broadcastPresence(
    address: string,
    online: boolean,
  ): Promise<void> {
    try {
      const partners = await this.chat.partnerIds(address);
      if (partners.length === 0) return;
      this.server
        ?.to(partners.map(userChannel))
        .emit(ChatEvents.PRESENCE, { userId: address, online });
    } catch (error) {
      this.logger.warn(
        `Presence update for ${address} failed: ${(error as Error).message}`,
      );
    }
  }
}
