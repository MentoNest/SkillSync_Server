import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { ChatPresence } from './chat-presence';
import { ChatService } from './chat.service';
import { MESSAGE_RATE_LIMIT } from './chat.types';

const MENTOR = '11111111-1111-1111-1111-111111111111';
const MENTEE = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
const ROOM = { id: 'room-1', mentorId: MENTOR, menteeId: MENTEE, lastMessageAt: null, createdAt: new Date() };

function build() {
  const rooms: any = {
    findOne: jest.fn().mockResolvedValue(ROOM),
    findOneOrFail: jest.fn().mockResolvedValue(ROOM),
    find: jest.fn().mockResolvedValue([ROOM]),
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: any) => Promise.resolve({ id: 'room-new', ...v })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  let n = 0;
  const messages: any = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: any) => Promise.resolve({ id: `m${++n}`, createdAt: new Date(), ...v })),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 4 }),
    createQueryBuilder: jest.fn(),
  };
  const sessions: any = { findOne: jest.fn().mockResolvedValue({ mentorId: MENTOR, menteeId: MENTEE }) };
  const storage: any = {
    save: jest.fn((_b: Buffer, name: string) => Promise.resolve(`/uploads/chat/${name}`)),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const presence = new ChatPresence();
  const notifications: any = { notify: jest.fn().mockResolvedValue(null) };
  const service = new ChatService(rooms, messages, sessions, storage, presence, notifications);
  return { service, rooms, messages, sessions, storage, presence, notifications };
}

function file(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('%PDF-1.4'),
    mimetype: 'application/pdf',
    size: 1024,
    originalname: 'notes.pdf',
    ...overrides,
  } as Express.Multer.File;
}

describe('ChatService', () => {
  describe('openRoom', () => {
    it('returns the existing room for a mentorship pairing', async () => {
      const { service, rooms } = build();
      expect(await service.openRoom(MENTEE, MENTOR)).toBe(ROOM);
      expect(rooms.findOne).toHaveBeenCalledWith({ where: { mentorId: MENTOR, menteeId: MENTEE } });
      expect(rooms.save).not.toHaveBeenCalled();
    });

    it('creates the room on first use with mentor/mentee taken from their session', async () => {
      const { service, rooms } = build();
      rooms.findOne.mockResolvedValue(null);
      const room = await service.openRoom(MENTOR, MENTEE);
      expect(room).toMatchObject({ id: 'room-new', mentorId: MENTOR, menteeId: MENTEE });
    });

    it('recovers when both participants create the room at once', async () => {
      const { service, rooms } = build();
      rooms.findOne.mockResolvedValue(null);
      rooms.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      expect(await service.openRoom(MENTOR, MENTEE)).toBe(ROOM);
    });

    it('refuses users without a shared session, and self-chat', async () => {
      const { service, sessions } = build();
      sessions.findOne.mockResolvedValue(null);
      await expect(service.openRoom(MENTOR, STRANGER)).rejects.toThrow(ForbiddenException);
      await expect(service.openRoom(MENTOR, MENTOR)).rejects.toThrow(BadRequestException);
    });
  });

  it('hides rooms the user is not part of', async () => {
    const { service } = build();
    await expect(service.getRoomFor(STRANGER, ROOM.id)).rejects.toThrow(NotFoundException);
    await expect(service.history(STRANGER, ROOM.id)).rejects.toThrow(NotFoundException);
    await expect(service.sendMessage(STRANGER, ROOM.id, 'hi')).rejects.toThrow(NotFoundException);
  });

  describe('sendMessage', () => {
    it('stores the message with a timestamp and bumps the room', async () => {
      const { service, messages, rooms, presence } = build();
      presence.connect(MENTOR);
      const { message, recipientId } = await service.sendMessage(MENTEE, ROOM.id, '  hello  ');
      expect(message).toMatchObject({ roomId: ROOM.id, senderId: MENTEE, body: 'hello', attachments: [], readAt: null });
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(recipientId).toBe(MENTOR);
      expect(messages.save).toHaveBeenCalledTimes(1);
      expect(rooms.update).toHaveBeenCalledWith({ id: ROOM.id }, { lastMessageAt: message.createdAt });
    });

    it('rejects empty and oversized messages', async () => {
      const { service } = build();
      await expect(service.sendMessage(MENTEE, ROOM.id, '   ')).rejects.toThrow(BadRequestException);
      await expect(service.sendMessage(MENTEE, ROOM.id, 'x'.repeat(4001))).rejects.toThrow(BadRequestException);
    });

    it('allows 10 messages per minute per sender', async () => {
      const { service, messages } = build();
      for (let i = 0; i < MESSAGE_RATE_LIMIT; i++) await service.sendMessage(MENTEE, ROOM.id, `m${i}`);
      const err = await service.sendMessage(MENTEE, ROOM.id, 'one too many').catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(messages.save).toHaveBeenCalledTimes(MESSAGE_RATE_LIMIT);
      // The limit is per sender.
      await expect(service.sendMessage(MENTOR, ROOM.id, 'reply')).resolves.toBeDefined();
    });

    it('sends a push placeholder only when the recipient is offline', async () => {
      const { service, notifications, presence } = build();
      await service.sendMessage(MENTEE, ROOM.id, 'are you there?');
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: MENTOR, channels: ['push'], data: expect.objectContaining({ roomId: ROOM.id }) }),
      );

      notifications.notify.mockClear();
      presence.connect(MENTOR);
      await service.sendMessage(MENTEE, ROOM.id, 'ok, you are online');
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('sendAttachment', () => {
    it('stores the file and sends it as a message', async () => {
      const { service, storage } = build();
      const { message } = await service.sendAttachment(MENTEE, ROOM.id, file(), 'my notes');
      expect(storage.save).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^room-1-.+\.pdf$/));
      expect(message.body).toBe('my notes');
      expect(message.attachments).toEqual([
        expect.objectContaining({ name: 'notes.pdf', mimeType: 'application/pdf', size: 1024, url: expect.stringMatching(/^\/uploads\/chat\//) }),
      ]);
    });

    it('accepts images without a caption', async () => {
      const { service } = build();
      const { message } = await service.sendAttachment(MENTEE, ROOM.id, file({ mimetype: 'image/png', originalname: 'a.png' }));
      expect(message.body).toBe('');
      expect(message.attachments).toHaveLength(1);
    });

    it('rejects missing, unsupported and oversized files', async () => {
      const { service, storage } = build();
      await expect(service.sendAttachment(MENTEE, ROOM.id, undefined)).rejects.toThrow(BadRequestException);
      await expect(service.sendAttachment(MENTEE, ROOM.id, file({ mimetype: 'application/x-msdownload' }))).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendAttachment(MENTEE, ROOM.id, file({ size: 11 * 1024 * 1024 }))).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('removes the stored file when the message cannot be sent', async () => {
      const { service, storage } = build();
      for (let i = 0; i < MESSAGE_RATE_LIMIT; i++) await service.sendMessage(MENTEE, ROOM.id, `m${i}`);
      await expect(service.sendAttachment(MENTEE, ROOM.id, file())).rejects.toThrow(HttpException);
      expect(storage.delete).toHaveBeenCalledWith(await storage.save.mock.results[0].value);
    });
  });

  it('marks the other participant’s messages read and reports a receipt', async () => {
    const { service, messages } = build();
    const now = new Date('2030-01-01T00:00:00Z');
    const receipt = await service.markRead(MENTOR, ROOM.id, now);
    expect(receipt).toEqual({ roomId: ROOM.id, readerId: MENTOR, participantId: MENTEE, readAt: now, updated: 4 });
    const [where, set] = messages.update.mock.calls[0];
    expect(where).toMatchObject({ roomId: ROOM.id });
    expect(set).toEqual({ readAt: now });
  });

  it('pages history newest first with a cursor', async () => {
    const { service, messages } = build();
    messages.find.mockResolvedValue(new Array(2).fill({ id: 'm' }));
    const page = await service.history(MENTEE, ROOM.id, { before: '2030-01-01T00:00:00Z', limit: 2 });
    expect(page).toMatchObject({ limit: 2, hasMore: true });
    expect(messages.find).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC' }, take: 2 }));
  });

  it('sums unread counts across rooms', async () => {
    const { service, messages } = build();
    const qb: any = {};
    for (const m of ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'groupBy']) qb[m] = jest.fn(() => qb);
    qb.getRawMany = jest.fn().mockResolvedValue([
      { roomId: 'room-1', unread: '3' },
      { roomId: 'room-2', unread: '2' },
    ]);
    messages.createQueryBuilder.mockReturnValue(qb);
    expect(await service.unreadCounts(MENTEE)).toEqual({
      total: 5,
      rooms: [
        { roomId: 'room-1', unread: 3 },
        { roomId: 'room-2', unread: 2 },
      ],
    });
  });
});

describe('ChatPresence', () => {
  it('keeps a user online until their last socket disconnects', () => {
    const presence = new ChatPresence();
    expect(presence.connect('u1')).toBe(true);
    expect(presence.connect('u1')).toBe(false);
    expect(presence.disconnect('u1')).toBe(false);
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.disconnect('u1')).toBe(true);
    expect(presence.isOnline('u1')).toBe(false);
    expect(presence.disconnect('u1')).toBe(false);
  });
});
