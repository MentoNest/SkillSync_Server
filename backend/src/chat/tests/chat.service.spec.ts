import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { Role } from '../../auth/auth.types';
import type { AuthUser } from '../../auth/auth.types';
import { NotificationType } from '../../notifications/notification.types';
import { ChatService } from '../chat.service';
import type { ChatMessage } from '../entities/chat-message.entity';
import type { ChatRoom } from '../entities/chat-room.entity';

const mentor = Keypair.random().publicKey().toLowerCase();
const mentee = Keypair.random().publicKey().toLowerCase();
const stranger = Keypair.random().publicKey().toLowerCase();

const user = (address: string, roles: Role[] = [Role.USER]): AuthUser => ({
  address,
  roles,
  jti: 'jti',
});

type Where = Record<string, unknown>;

interface RoomRepoStub {
  rows: ChatRoom[];
  create: jest.Mock<ChatRoom, [Partial<ChatRoom>]>;
  save: jest.Mock<Promise<ChatRoom>, [ChatRoom]>;
  findOne: jest.Mock<Promise<ChatRoom | null>, [{ where: Where }]>;
  find: jest.Mock<Promise<ChatRoom[]>, []>;
  update: jest.Mock<Promise<{ affected: number }>, []>;
  createQueryBuilder: jest.Mock;
}

interface MessageRepoStub {
  rows: ChatMessage[];
  unreadRows: { roomId: string; unread: string }[];
  create: jest.Mock<ChatMessage, [Partial<ChatMessage>]>;
  save: jest.Mock<Promise<ChatMessage>, [ChatMessage]>;
  find: jest.Mock<Promise<ChatMessage[]>, [options?: { take?: number }]>;
  update: jest.Mock<Promise<{ affected: number }>, []>;
  createQueryBuilder: jest.Mock;
}

function matches(row: object, where: Where | Where[]): boolean {
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((clause) =>
    Object.entries(clause).every(
      ([key, value]) => (row as Record<string, unknown>)[key] === value,
    ),
  );
}

function setup() {
  const rooms: RoomRepoStub = {
    rows: [],
    create: jest.fn(
      (data: Partial<ChatRoom>): ChatRoom => ({ ...data }) as ChatRoom,
    ),
    save: jest.fn((room: ChatRoom): Promise<ChatRoom> => {
      const saved: ChatRoom = {
        ...room,
        id: room.id ?? `room-${rooms.rows.length + 1}`,
      };
      rooms.rows.push(saved);
      return Promise.resolve(saved);
    }),
    findOne: jest.fn(({ where }: { where: Where }): Promise<ChatRoom | null> =>
      Promise.resolve(rooms.rows.find((room) => matches(room, where)) ?? null),
    ),
    find: jest.fn((): Promise<ChatRoom[]> => Promise.resolve(rooms.rows)),
    update: jest.fn((): Promise<{ affected: number }> =>
      Promise.resolve({ affected: 1 }),
    ),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve(rooms.rows)),
    })),
  };

  const messages: MessageRepoStub = {
    rows: [],
    unreadRows: [],
    create: jest.fn(
      (data: Partial<ChatMessage>): ChatMessage =>
        ({
          id: `message-${messages.rows.length + 1}`,
          createdAt: new Date(1000),
          ...data,
        }) as ChatMessage,
    ),
    save: jest.fn((message: ChatMessage): Promise<ChatMessage> => {
      messages.rows.push(message);
      return Promise.resolve(message);
    }),
    find: jest.fn((options?: { take?: number }): Promise<ChatMessage[]> =>
      Promise.resolve(
        messages.rows.slice(0, options?.take ?? messages.rows.length),
      ),
    ),
    update: jest.fn((): Promise<{ affected: number }> =>
      Promise.resolve({ affected: 1 }),
    ),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(() => Promise.resolve(messages.unreadRows)),
    })),
  };

  const storage = {
    validate: jest.fn(() => ({
      name: 'photo.png',
      mimeType: 'image/png',
      size: 4,
      extension: 'png',
    })),
    save: jest.fn(() => Promise.resolve('/uploads/chat/photo.png')),
    delete: jest.fn(() => Promise.resolve()),
  };
  const presence = {
    isOnline: jest.fn(() => true),
    connect: jest.fn(() => true),
    disconnect: jest.fn(() => true),
  };
  const notifications = { notify: jest.fn(() => Promise.resolve()) };

  const service = new ChatService(
    rooms as never,
    messages as never,
    storage as never,
    presence as never,
    notifications as never,
  );
  return { service, rooms, messages, storage, presence, notifications };
}

describe('ChatService', () => {
  it('opens one room per session and stores participant wallet addresses', async () => {
    const { service, rooms } = setup();

    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    expect(room.sessionId).toBe('session-1');
    expect(room.mentorAddress).toBe(mentor);
    expect(room.menteeAddress).toBe(mentee);
    expect(rooms.rows).toHaveLength(1);

    await expect(
      service.openRoom(user(mentor, [Role.MENTOR]), 'session-1', mentee),
    ).resolves.toBe(room);
    await expect(
      service.openRoom(user(mentor), 'session-2', mentor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-participants and clamps history limits', async () => {
    const { service, messages } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );

    await expect(service.getRoomFor(stranger, room.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const page = await service.history(mentee, room.id, { limit: 500 });
    expect(page.limit).toBe(100);
    expect(messages.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('persists messages and notifies an offline recipient', async () => {
    const { service, messages, presence, notifications } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    presence.isOnline.mockReturnValue(false);

    const { message, recipientId } = await service.sendMessage(
      mentor,
      room.id,
      'hello',
      [],
      1000,
    );
    expect(message.body).toBe('hello');
    expect(message.senderId).toBe(mentor);
    expect(messages.rows).toHaveLength(1);
    expect(recipientId).toBe(mentee);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.MESSAGE,
        userId: mentee,
      }),
    );
  });

  it('limits a user to 10 messages per minute without blocking the other participant', async () => {
    const { service } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    const now = 60_000;

    for (let index = 0; index < 10; index += 1) {
      await expect(
        service.sendMessage(mentor, room.id, `m${index}`, [], now),
      ).resolves.toBeDefined();
    }

    const rejected: unknown = await service
      .sendMessage(mentor, room.id, 'overflow', [], now)
      .catch((error: unknown): unknown => error);
    expect(rejected).toBeInstanceOf(HttpException);
    expect((rejected as HttpException).getStatus()).toBe(429);
    await expect(
      service.sendMessage(mentee, room.id, 'ok', [], now),
    ).resolves.toBeDefined();
  });

  it('marks only the other participant messages as read', async () => {
    const { service, messages } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    messages.update.mockResolvedValueOnce({ affected: 2 });

    const receipt = await service.markRead(mentee, room.id, new Date(5000));
    expect(receipt).toMatchObject({
      roomId: room.id,
      readerId: mentee,
      participantId: mentor,
      updated: 2,
    });
    expect(messages.update).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: room.id }),
      { readAt: new Date(5000) },
    );
  });

  it('aggregates unread counts across rooms', async () => {
    const { service, messages } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    messages.unreadRows = [
      { roomId: room.id, unread: '3' },
      { roomId: 'another-room', unread: '2' },
    ];

    await expect(service.unreadCounts(mentee)).resolves.toEqual({
      total: 5,
      rooms: [
        { roomId: room.id, unread: 3 },
        { roomId: 'another-room', unread: 2 },
      ],
    });
  });

  it('validates and stores an attachment before sending it', async () => {
    const { service, storage } = setup();
    const room = await service.openRoom(
      user(mentor, [Role.MENTOR]),
      'session-1',
      mentee,
    );
    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 4,
      buffer: Buffer.from('png!'),
    };

    const { message } = await service.sendAttachment(
      mentor,
      room.id,
      file,
      'caption',
    );
    expect(storage.validate).toHaveBeenCalledWith(file);
    expect(storage.save).toHaveBeenCalledWith(
      file.buffer,
      expect.stringMatching(/\.png$/),
    );
    expect(message.attachments).toEqual([
      {
        url: '/uploads/chat/photo.png',
        name: 'photo.png',
        mimeType: 'image/png',
        size: 4,
      },
    ]);
  });
});
