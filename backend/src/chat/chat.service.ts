import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { NotificationRateLimiter } from '../notifications/notification-rate-limiter';
import { NotificationChannel, NotificationType } from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { Session } from '../sessions/entities/session.entity';
import { StorageService } from '../users/avatar/storage.service';
import { ChatPresence } from './chat-presence';
import {
  ATTACHMENT_MIME_TYPES,
  ChatAttachment,
  DEFAULT_HISTORY_LIMIT,
  MAX_ATTACHMENT_BYTES,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW_MS,
} from './chat.types';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRoom } from './entities/chat-room.entity';

const PG_UNIQUE_VIOLATION = '23505';

export interface ReadReceipt {
  roomId: string;
  readerId: string;
  /** The other participant, whose messages were just read. */
  participantId: string;
  readAt: Date;
  updated: number;
}

export interface UnreadCounts {
  total: number;
  rooms: { roomId: string; unread: number }[];
}

@Injectable()
export class ChatService {
  private readonly limiter = new NotificationRateLimiter(MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS);

  constructor(
    @InjectRepository(ChatRoom) private readonly rooms: Repository<ChatRoom>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly storage: StorageService,
    private readonly presence: ChatPresence,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Returns the room for a mentorship pairing, creating it on first use.
   * Only users who share at least one session form a pairing.
   */
  async openRoom(userId: string, participantId: string): Promise<ChatRoom> {
    if (userId === participantId) throw new BadRequestException('You cannot chat with yourself');

    const session = await this.sessions.findOne({
      where: [
        { mentorId: userId, menteeId: participantId },
        { mentorId: participantId, menteeId: userId },
      ],
    });
    if (!session) throw new ForbiddenException('You can only chat with your mentors and mentees');

    const pair = { mentorId: session.mentorId, menteeId: session.menteeId };
    const existing = await this.rooms.findOne({ where: pair });
    if (existing) return existing;
    try {
      return await this.rooms.save(this.rooms.create({ ...pair, lastMessageAt: null }));
    } catch (err) {
      // Both participants opened the room at once: the other insert won.
      if ((err as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw err;
      return this.rooms.findOneOrFail({ where: pair });
    }
  }

  listRooms(userId: string): Promise<ChatRoom[]> {
    return this.rooms
      .createQueryBuilder('room')
      .where('room.mentorId = :userId OR room.menteeId = :userId', { userId })
      .orderBy('room.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('room.createdAt', 'DESC')
      .getMany();
  }

  /** Loads a room the user belongs to; 404 for rooms that are not theirs. */
  async getRoomFor(userId: string, roomId: string): Promise<ChatRoom> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room || (room.mentorId !== userId && room.menteeId !== userId)) {
      throw new NotFoundException('Chat room not found');
    }
    return room;
  }

  /** Ids of everyone the user has a chat room with. */
  async partnerIds(userId: string): Promise<string[]> {
    const rooms = await this.rooms.find({ where: [{ mentorId: userId }, { menteeId: userId }] });
    return rooms.map((room) => otherParticipant(room, userId));
  }

  /** Conversation history, newest first; page back with `before` = oldest `createdAt` seen. */
  async history(userId: string, roomId: string, query: { before?: string; limit?: number } = {}) {
    await this.getRoomFor(userId, roomId);
    const limit = Math.min(query.limit && query.limit >= 1 ? query.limit : DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
    const items = await this.messages.find({
      where: query.before ? { roomId, createdAt: LessThan(new Date(query.before)) } : { roomId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return { items, limit, hasMore: items.length === limit };
  }

  /**
   * Stores a message (rate limited per sender) and pings an offline
   * recipient through the push placeholder.
   */
  async sendMessage(
    userId: string,
    roomId: string,
    body: string,
    attachments: ChatAttachment[] = [],
  ): Promise<{ message: ChatMessage; recipientId: string }> {
    const text = (body ?? '').trim();
    if (!text && attachments.length === 0) throw new BadRequestException('A message needs text or an attachment');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);
    }

    const room = await this.getRoomFor(userId, roomId);
    if (!this.limiter.tryAcquire(userId, 'chat')) {
      throw new HttpException(
        { statusCode: 429, message: `You can send at most ${MESSAGE_RATE_LIMIT} messages per minute` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const message = await this.messages.save(
      this.messages.create({ roomId, senderId: userId, body: text, attachments, readAt: null }),
    );
    await this.rooms.update({ id: roomId }, { lastMessageAt: message.createdAt });

    const recipientId = otherParticipant(room, userId);
    if (!this.presence.isOnline(recipientId)) this.notifyOffline(recipientId, message);
    return { message, recipientId };
  }

  /** Validates and stores an uploaded file, then sends it as a message. */
  async sendAttachment(userId: string, roomId: string, file: Express.Multer.File | undefined, caption = '') {
    if (!file) throw new BadRequestException('No file uploaded');
    const extension = ATTACHMENT_MIME_TYPES[file.mimetype];
    if (!extension) throw new BadRequestException('Unsupported file type: images, PDF, text and Word documents only');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Attachments are limited to 10MB');

    await this.getRoomFor(userId, roomId);
    const url = await this.storage.save(file.buffer, `${roomId}-${randomUUID()}.${extension}`);
    const attachment: ChatAttachment = {
      url,
      name: (file.originalname || `attachment.${extension}`).slice(0, 255),
      mimeType: file.mimetype,
      size: file.size,
    };
    try {
      return await this.sendMessage(userId, roomId, caption, [attachment]);
    } catch (err) {
      await this.storage.delete(url);
      throw err;
    }
  }

  /** Marks everything the other participant sent in the room as read. */
  async markRead(userId: string, roomId: string, now: Date = new Date()): Promise<ReadReceipt> {
    const room = await this.getRoomFor(userId, roomId);
    const res = await this.messages.update(
      { roomId, senderId: Not(userId), readAt: IsNull() },
      { readAt: now },
    );
    return {
      roomId,
      readerId: userId,
      participantId: otherParticipant(room, userId),
      readAt: now,
      updated: res.affected ?? 0,
    };
  }

  async unreadCounts(userId: string): Promise<UnreadCounts> {
    const rows: { roomId: string; unread: string }[] = await this.messages
      .createQueryBuilder('message')
      .innerJoin(ChatRoom, 'room', 'room.id = message.roomId')
      .select('message.roomId', 'roomId')
      .addSelect('COUNT(*)', 'unread')
      .where('(room.mentorId = :userId OR room.menteeId = :userId)', { userId })
      .andWhere('message.senderId != :userId', { userId })
      .andWhere('message.readAt IS NULL')
      .groupBy('message.roomId')
      .getRawMany();
    const rooms = rows.map((row) => ({ roomId: row.roomId, unread: Number(row.unread) }));
    return { total: rooms.reduce((sum, room) => sum + room.unread, 0), rooms };
  }

  /** Push notification placeholder for recipients with no open socket. */
  private notifyOffline(recipientId: string, message: ChatMessage): void {
    const preview = message.body || `Sent ${message.attachments.length} attachment(s)`;
    void this.notifications?.notify({
      userId: recipientId,
      type: NotificationType.MESSAGE,
      title: 'New message',
      body: preview.slice(0, 140),
      data: { roomId: message.roomId, messageId: message.id },
      channels: [NotificationChannel.PUSH],
    });
  }
}

export function otherParticipant(room: ChatRoom, userId: string): string {
  return room.mentorId === userId ? room.menteeId : room.mentorId;
}
