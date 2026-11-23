import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { ResourceNotFoundException } from '../common/errors/app-exceptions';
import { LocalStorageService } from '../common/storage/storage.service';
import type { AttachmentFile } from '../common/storage/storage.constants';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { MessageRateLimiter } from './chat-rate-limiter';
import { ChatPresence } from './chat-presence';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  MESSAGE_RATE_LIMIT,
} from './chat.types';
import type { ChatAttachment } from './chat.types';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRoom } from './entities/chat-room.entity';

const PG_UNIQUE_VIOLATION = '23505';

export interface ReadReceipt {
  roomId: string;
  readerId: string;
  participantId: string;
  readAt: Date;
  updated: number;
}

export interface UnreadCounts {
  total: number;
  rooms: { roomId: string; unread: number }[];
}

export interface HistoryPage {
  items: ChatMessage[];
  limit: number;
  hasMore: boolean;
}

export interface SentMessage {
  message: ChatMessage;
  recipientId: string;
}

@Injectable()
export class ChatService {
  private readonly limiter = new MessageRateLimiter();

  constructor(
    @InjectRepository(ChatRoom) private readonly rooms: Repository<ChatRoom>,
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    private readonly storage: LocalStorageService,
    private readonly presence: ChatPresence,
    private readonly notifications: NotificationsService,
  ) {}

  async openRoom(
    user: AuthUser,
    sessionId: string,
    participantId: string,
  ): Promise<ChatRoom> {
    const address = normalizeWalletAddress(user.address);
    const participant = normalizeWalletAddress(participantId);
    if (address === participant)
      throw new BadRequestException('You cannot chat with yourself');

    const existing = await this.rooms.findOne({ where: { sessionId } });
    if (existing) {
      this.assertParticipant(existing, address);
      return existing;
    }

    const mentorAddress = user.roles?.includes(Role.MENTOR)
      ? address
      : participant;
    const menteeAddress = mentorAddress === address ? participant : address;
    try {
      return await this.rooms.save(
        this.rooms.create({
          sessionId,
          mentorAddress,
          menteeAddress,
          lastMessageAt: null,
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code !== PG_UNIQUE_VIOLATION)
        throw error;
      const room = await this.rooms.findOne({ where: { sessionId } });
      if (!room) throw error;
      this.assertParticipant(room, address);
      return room;
    }
  }

  listRooms(address: string): Promise<ChatRoom[]> {
    const normalized = normalizeWalletAddress(address);
    return this.rooms
      .createQueryBuilder('room')
      .where('room.mentorAddress = :address OR room.menteeAddress = :address', {
        address: normalized,
      })
      .orderBy('room.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('room.createdAt', 'DESC')
      .getMany();
  }

  async getRoomFor(address: string, roomId: string): Promise<ChatRoom> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new ResourceNotFoundException('Chat room', roomId);
    this.assertParticipant(room, normalizeWalletAddress(address));
    return room;
  }

  async partnerIds(address: string): Promise<string[]> {
    const normalized = normalizeWalletAddress(address);
    const rooms = await this.rooms.find({
      where: [{ mentorAddress: normalized }, { menteeAddress: normalized }],
    });
    return rooms.map((room) => otherParticipant(room, normalized));
  }

  async history(
    address: string,
    roomId: string,
    query: { before?: string; limit?: number } = {},
  ): Promise<HistoryPage> {
    await this.getRoomFor(address, roomId);
    const limit = Math.min(
      query.limit && query.limit >= 1
        ? Math.floor(query.limit)
        : DEFAULT_HISTORY_LIMIT,
      MAX_HISTORY_LIMIT,
    );
    const items = await this.messages.find({
      where: query.before
        ? { roomId, createdAt: LessThan(new Date(query.before)) }
        : { roomId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return { items, limit, hasMore: items.length === limit };
  }

  async sendMessage(
    senderAddress: string,
    roomId: string,
    body: string,
    attachments: ChatAttachment[] = [],
    now: number = Date.now(),
  ): Promise<SentMessage> {
    const text = (body ?? '').trim();
    if (!text && attachments.length === 0) {
      throw new BadRequestException('A message needs text or an attachment');
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const senderId = normalizeWalletAddress(senderAddress);
    const room = await this.getRoomFor(senderId, roomId);
    if (!this.limiter.tryAcquire(senderId, now)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `You can send at most ${MESSAGE_RATE_LIMIT} messages per minute`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const message = await this.messages.save(
      this.messages.create({
        roomId,
        senderId,
        body: text,
        attachments,
        readAt: null,
      }),
    );
    await this.rooms.update(
      { id: roomId },
      { lastMessageAt: message.createdAt },
    );

    const recipientId = otherParticipant(room, senderId);
    if (!this.presence.isOnline(recipientId))
      this.notifyOffline(recipientId, message);
    return { message, recipientId };
  }

  async sendAttachment(
    senderAddress: string,
    roomId: string,
    file: AttachmentFile | undefined,
    caption = '',
  ): Promise<SentMessage> {
    if (!file?.buffer) throw new BadRequestException('No file uploaded');
    const validated = this.storage.validate(file);
    const senderId = normalizeWalletAddress(senderAddress);
    await this.getRoomFor(senderId, roomId);

    const filename = `${roomId}-${randomUUID()}.${validated.extension}`;
    const url = await this.storage.save(file.buffer, filename);
    const attachment: ChatAttachment = {
      url,
      name: validated.name,
      mimeType: validated.mimeType,
      size: validated.size,
    };
    try {
      return await this.sendMessage(senderId, roomId, caption, [attachment]);
    } catch (error) {
      await this.storage.delete(url);
      throw error;
    }
  }

  async markRead(
    address: string,
    roomId: string,
    now: Date = new Date(),
  ): Promise<ReadReceipt> {
    const readerId = normalizeWalletAddress(address);
    const room = await this.getRoomFor(readerId, roomId);
    const result = await this.messages.update(
      { roomId, senderId: Not(readerId), readAt: IsNull() },
      { readAt: now },
    );
    return {
      roomId,
      readerId,
      participantId: otherParticipant(room, readerId),
      readAt: now,
      updated: result.affected ?? 0,
    };
  }

  async unreadCounts(address: string): Promise<UnreadCounts> {
    const normalized = normalizeWalletAddress(address);
    const rows: { roomId: string; unread: string }[] = await this.messages
      .createQueryBuilder('message')
      .innerJoin(ChatRoom, 'room', 'room.id = message.roomId')
      .select('message.roomId', 'roomId')
      .addSelect('COUNT(*)', 'unread')
      .where('room.mentorAddress = :address OR room.menteeAddress = :address', {
        address: normalized,
      })
      .andWhere('message.senderId != :address', { address: normalized })
      .andWhere('message.readAt IS NULL')
      .groupBy('message.roomId')
      .getRawMany();
    const rooms = rows.map((row) => ({
      roomId: row.roomId,
      unread: Number(row.unread),
    }));
    return { total: rooms.reduce((sum, room) => sum + room.unread, 0), rooms };
  }

  private assertParticipant(room: ChatRoom, address: string): void {
    if (room.mentorAddress !== address && room.menteeAddress !== address) {
      throw new ForbiddenException(
        'You are not a participant in this chat room',
      );
    }
  }

  private notifyOffline(recipientId: string, message: ChatMessage): void {
    const preview =
      message.body || `Sent ${message.attachments.length} attachment(s)`;
    void this.notifications.notify({
      userId: recipientId,
      type: NotificationType.MESSAGE,
      title: 'New message',
      body: preview.slice(0, 140),
      data: { roomId: message.roomId, messageId: message.id },
      channels: [NotificationChannel.PUSH],
    });
  }
}

export function otherParticipant(room: ChatRoom, address: string): string {
  return room.mentorAddress === address
    ? room.menteeAddress
    : room.mentorAddress;
}
