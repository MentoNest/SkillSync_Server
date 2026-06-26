import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, LessThan, Not } from 'typeorm';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MentorshipSession } from './entities/mentorship-session.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { Message, MessageType } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { AttachmentDto } from './dto/send-message.dto';

export interface SaveMessageInput {
  roomId: string;
  senderId: string;
  content?: string;
  messageType?: MessageType;
  attachments?: AttachmentDto[];
}

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(MentorshipSession)
    private readonly sessionRepo: Repository<MentorshipSession>,

    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(MessageAttachment)
    private readonly attachmentRepo: Repository<MessageAttachment>,
  ) {}

  onModuleInit() {
    const uploadDir = join(process.cwd(), 'uploads', 'chat');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
  }

  async createSession(mentorId: string, menteeId: string, contractSessionId?: string): Promise<MentorshipSession> {
    const session = this.sessionRepo.create({ mentorId, menteeId, contractSessionId: contractSessionId ?? null });
    const saved = await this.sessionRepo.save(session);

    const room = this.roomRepo.create({ sessionId: saved.id });
    await this.roomRepo.save(room);

    return this.sessionRepo.findOne({
      where: { id: saved.id },
      relations: { chatRoom: true },
    }) as Promise<MentorshipSession>;
  }

  async getRoomForSession(sessionId: string): Promise<ChatRoom | null> {
    return this.roomRepo.findOne({ where: { sessionId }, relations: { session: true } });
  }

  async getRoom(roomId: string): Promise<ChatRoom | null> {
    return this.roomRepo.findOne({ where: { id: roomId }, relations: { session: true } });
  }

  async getUserRooms(userId: string): Promise<string[]> {
    const sessions = await this.sessionRepo.find({
      where: [{ mentorId: userId }, { menteeId: userId }],
      relations: { chatRoom: true },
    });
    return sessions.filter((s) => s.chatRoom).map((s) => s.chatRoom.id);
  }

  async userHasRoomAccess(userId: string, roomId: string): Promise<boolean> {
    const room = await this.roomRepo.findOne({ where: { id: roomId }, relations: { session: true } });
    if (!room?.session) return false;
    return room.session.mentorId === userId || room.session.menteeId === userId;
  }

  async saveMessage(input: SaveMessageInput): Promise<Message> {
    const message = this.messageRepo.create({
      roomId: input.roomId,
      senderId: input.senderId,
      content: input.content ?? null,
      messageType: input.messageType ?? MessageType.TEXT,
    });

    const saved = await this.messageRepo.save(message);

    if (input.attachments?.length) {
      const attachments = input.attachments.map((a) =>
        this.attachmentRepo.create({
          messageId: saved.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
        }),
      );
      await this.attachmentRepo.save(attachments);
    }

    return this.messageRepo.findOne({
      where: { id: saved.id },
      relations: { attachments: true },
    }) as Promise<Message>;
  }

  async getMessageHistory(roomId: string, limit = 50, before?: string): Promise<Message[]> {
    let beforeDate: Date | undefined;

    if (before) {
      const pivot = await this.messageRepo.findOne({ where: { id: before } });
      if (pivot) {
        beforeDate = pivot.createdAt;
      }
    }

    const messages = await this.messageRepo.find({
      where: {
        roomId,
        ...(beforeDate ? { createdAt: LessThan(beforeDate) } : {}),
      },
      relations: { attachments: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return messages.reverse();
  }

  async markMessagesRead(roomId: string, userId: string, messageIds?: string[]): Promise<void> {
    const now = new Date();

    if (messageIds?.length) {
      await this.messageRepo.update(
        { id: In(messageIds), roomId, isRead: false },
        { isRead: true, readAt: now },
      );
    } else {
      const unread = await this.messageRepo.find({
        where: { roomId, isRead: false },
        select: { id: true, senderId: true },
      });

      const toMark = unread.filter((m) => m.senderId !== userId).map((m) => m.id);
      if (toMark.length) {
        await this.messageRepo.update({ id: In(toMark) }, { isRead: true, readAt: now });
      }
    }
  }

  async getUnreadCount(roomId: string, userId: string): Promise<number> {
    const hasAccess = await this.userHasRoomAccess(userId, roomId);
    if (!hasAccess) throw new ForbiddenException('Access denied');

    return this.messageRepo.count({
      where: { roomId, isRead: false, senderId: Not(userId) },
    });
  }

  async getUserRoomsWithDetails(userId: string): Promise<ChatRoom[]> {
    const sessions = await this.sessionRepo.find({
      where: [{ mentorId: userId }, { menteeId: userId }],
      relations: { chatRoom: true },
    });
    return sessions.filter((s) => s.chatRoom).map((s) => s.chatRoom);
  }

  async storeAttachmentRecord(data: {
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }): Promise<MessageAttachment> {
    const attachment = this.attachmentRepo.create({ messageId: null, ...data });
    return this.attachmentRepo.save(attachment);
  }

  async cleanupOrphanedAttachments(): Promise<void> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    await this.attachmentRepo.delete({ messageId: IsNull(), createdAt: LessThan(cutoff) });
  }

  // Throws NotFoundException when room doesn't exist (used by controller)
  async getRoomOrThrow(roomId: string): Promise<ChatRoom> {
    const room = await this.roomRepo.findOne({ where: { id: roomId }, relations: { session: true } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }
}
