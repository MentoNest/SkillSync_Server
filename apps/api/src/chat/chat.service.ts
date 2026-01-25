import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource, Not } from 'typeorm';
import { Thread } from './entities/thread.entity';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
// import { User } from '../users/entities/user.entity';
import { PaginationParamsDto } from './dto/pagination-params.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';

type ThreadWithUnreadCount = Thread & {
  unreadCount: number;
};

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Thread)
    private readonly threadRepository: Repository<Thread>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly dataSource: DataSource,
  ) {}

  async findOrCreateThread(
    mentorId: string,
    menteeId: string,
  ): Promise<Thread> {
    // Check if thread already exists
    const existingThread = await this.threadRepository.findOne({
      where: [
        { mentor: { id: mentorId }, mentee: { id: menteeId } },
        { mentor: { id: menteeId }, mentee: { id: mentorId } },
      ],
      relations: ['mentor', 'mentee'],
    });

    if (existingThread) {
      return existingThread;
    }

    // Create new thread
    const thread = this.threadRepository.create({
      mentor: { id: mentorId },
      mentee: { id: menteeId },
    });

    return await this.threadRepository.save(thread);
  }

  async createThreadOnBooking(
    mentorId: string,
    menteeId: string,
  ): Promise<Thread> {
    // This method is specifically called when a booking is created
    return await this.findOrCreateThread(mentorId, menteeId);
  }

  async sendMessage(
    threadId: string,
    senderId: string,
    createMessageDto: CreateMessageDto,
  ): Promise<Message> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['mentor', 'mentee'],
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (!thread.isParticipant(senderId)) {
      throw new ForbiddenException('You are not a participant in this thread');
    }

    // Use transaction to ensure consistency
    return await this.dataSource.transaction(async (manager) => {
      const message = manager.create(Message, {
        thread: { id: threadId },
        sender: { id: senderId },
        body: createMessageDto.body,
      });

      const savedMessage = await manager.save(message);

      // Update thread's last message preview and timestamp
      thread.lastMessagePreview = this.truncatePreview(createMessageDto.body);
      thread.lastMessageAt = new Date();
      await manager.save(thread);

      return savedMessage;
    });
  }

  async getThreadMessages(
    threadId: string,
    userId: string,
    paginationParams: PaginationParamsDto,
  ): Promise<PaginatedResponseDto<Message>> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['mentor', 'mentee'],
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (!thread.isParticipant(userId)) {
      throw new ForbiddenException('You are not a participant in this thread');
    }

    const { page, limit } = paginationParams;
    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { thread: { id: threadId } },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Mark messages as read if they were sent by the other participant
    const unreadMessages = messages.filter(
      (msg) => !msg.isRead && msg.sender.id !== userId,
    );

    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map((msg) => msg.id);
      await this.messageRepository.update(unreadIds, {
        isRead: true,
        readAt: new Date(),
      });
    }

    const totalPages = Math.ceil(total / limit);

    return {
      items: messages.reverse(), // Return in chronological order
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  async getUserThreads(
    userId: string,
    paginationParams: PaginationParamsDto,
  ): Promise<PaginatedResponseDto<Thread & { unreadCount: number }>> {
    const { page, limit } = paginationParams;
    const skip = (page - 1) * limit;

    const [threads, total] = await this.threadRepository.findAndCount({
      where: [
        { mentor: { id: userId } },
        { mentee: { id: userId } },
      ] as FindOptionsWhere<Thread>[],
      relations: ['mentor', 'mentee', 'messages'],
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
      skip,
      take: limit,
    });

    // Calculate unread counts for each thread and attach to the entity instance
    const threadsWithUnreadCount: ThreadWithUnreadCount[] = await Promise.all(
      threads.map(async (thread): Promise<ThreadWithUnreadCount> => {
        const unreadCount = await this.messageRepository.count({
          where: {
            thread: { id: thread.id },
            sender: { id: Not(userId) },
            isRead: false,
          },
        });

        // Mutate the entity instance to preserve class methods (isParticipant, getOtherParticipant)
        const t = thread as ThreadWithUnreadCount;
        t.unreadCount = unreadCount;
        return t;
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      items: threadsWithUnreadCount,
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  async getThread(threadId: string, userId: string): Promise<Thread> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['mentor', 'mentee'],
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (!thread.isParticipant(userId)) {
      throw new ForbiddenException('You are not a participant in this thread');
    }

    return thread;
  }

  async markThreadAsRead(threadId: string, userId: string): Promise<void> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (!thread.isParticipant(userId)) {
      throw new ForbiddenException('You are not a participant in this thread');
    }

    await this.messageRepository.update(
      {
        thread: { id: threadId },
        sender: { id: Not(userId) },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  private truncatePreview(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }
}
