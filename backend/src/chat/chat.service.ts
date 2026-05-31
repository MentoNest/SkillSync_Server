import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage, MentorshipSession } from './entities/chat-message.entity';
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly RATE_LIMIT_KEY = 'chat_rate_limit';
  private readonly MAX_MESSAGES_PER_MINUTE = 10;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(MentorshipSession)
    private readonly sessionRepo: Repository<MentorshipSession>,
    private readonly redisService: RedisService,
  ) {}

  async createSession(mentorId: string, menteeId: string): Promise<MentorshipSession> {
    const session = this.sessionRepo.create({
      id: randomUUID(),
      mentorId,
      menteeId,
      status: 'active',
    });
    return this.sessionRepo.save(session);
  }

  async getSession(sessionId: string): Promise<MentorshipSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async getUserSessions(userId: string): Promise<MentorshipSession[]> {
    return this.sessionRepo.find({
      where: [{ mentorId: userId, status: 'active' as any }, { menteeId: userId, status: 'active' as any }],
      order: { updatedAt: 'DESC' },
    });
  }

  async validateSessionAccess(sessionId: string, userId: string): Promise<MentorshipSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('Access denied to this session');
    }
    if (session.status !== 'active') {
      throw new ForbiddenException('Session is not active');
    }
    return session;
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    const key = `${this.RATE_LIMIT_KEY}:${userId}`;
    const current = await this.redisService.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= this.MAX_MESSAGES_PER_MINUTE) {
      return false;
    }

    if (count === 0) {
      await this.redisService.set(key, '1', 60);
    } else {
      await this.redisService.set(key, String(count + 1), 60);
    }

    return true;
  }

  async sendMessage(
    sessionId: string,
    senderId: string,
    content: string,
    fileUrl?: string | null,
    fileName?: string | null,
    fileType?: string | null,
  ): Promise<ChatMessage> {
    await this.validateSessionAccess(sessionId, senderId);

    const message = this.messageRepo.create({
      id: randomUUID(),
      sessionId,
      senderId,
      content,
      fileUrl: fileUrl ?? null,
      fileName: fileName ?? null,
      fileType: fileType ?? null,
      readBy: [senderId],
    });

    const saved = await this.messageRepo.save(message);
    this.logger.log(`Message sent in session ${sessionId} by user ${senderId}`);
    return saved;
  }

  async getMessages(sessionId: string, userId: string, limit = 50, offset = 0): Promise<ChatMessage[]> {
    await this.validateSessionAccess(sessionId, userId);
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  async markAsRead(messageId: string, userId: string): Promise<ChatMessage> {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (!message.readBy.includes(userId)) {
      message.readBy = [...message.readBy, userId];
      return this.messageRepo.save(message);
    }

    return message;
  }

  async getUnreadCount(userId: string, sessionId: string): Promise<{ count: number }> {
    await this.validateSessionAccess(sessionId, userId);
    const messages = await this.messageRepo.find({
      where: { sessionId },
    });
    const count = messages.filter((m) => !m.readBy.includes(userId)).length;
    return { count };
  }

  async getSocketId(userId: string): Promise<string | null> {
    const status = await this.redisService.get(`user_socket:${userId}`);
    return status;
  }
}