import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity.js';
import { MessageType } from './entities/enums/message-type.enum.js';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async sendMessage(
    sessionId: string,
    senderId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<Message> {
    const message = this.messageRepo.create({
      sessionId,
      senderId,
      content,
      type,
      readBy: [senderId],
    });
    return this.messageRepo.save(message);
  }

  async getMessages(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): Promise<Message[]> {
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getUnreadCount(sessionId: string, userId: string): Promise<number> {
    const total = await this.messageRepo.count({ where: { sessionId } });
    const readCount = await this.messageRepo
      .createQueryBuilder('message')
      .where('message.sessionId = :sessionId', { sessionId })
      .andWhere(`message.readBy @> :userId`, {
        userId: JSON.stringify([userId]),
      })
      .getCount();
    return total - readCount;
  }

  async markAsRead(
    sessionId: string,
    userId: string,
    messageIds: string[],
  ): Promise<void> {
    for (const id of messageIds) {
      await this.messageRepo
        .createQueryBuilder()
        .update(Message)
        .set({ readBy: () => `array_append(readBy, '${userId}')` })
        .where('id = :id', { id })
        .andWhere(`NOT readBy @> :userId`, {
          userId: JSON.stringify([userId]),
        })
        .execute();
    }
  }
}
