import { ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatPresence } from './chat-presence';
import { ChatGateway } from './chat.gateway';
import { ChatEvents } from './chat.types';
import { extractToken, WsAuthService } from './ws-auth.service';

const MENTOR = 'mentor-1';
const MENTEE = 'mentee-1';
const ROOM = { id: 'room-1', mentorId: MENTOR, menteeId: MENTEE };

function socket(userId: string) {
  const rooms = new Set<string>();
  const relayed: { channel: string; event: string; payload: unknown }[] = [];
  return {
    data: { user: { sub: userId } },
    rooms,
    relayed,
    join: jest.fn(async (ch: string) => void rooms.add(ch)),
    leave: jest.fn(async (ch: string) => void rooms.delete(ch)),
    disconnect: jest.fn(),
    to: jest.fn((channel: string) => ({ emit: (event: string, payload: unknown) => relayed.push({ channel, event, payload }) })),
  } as any;
}

function build() {
  const emitted: { channels: string[]; event: string; payload: any }[] = [];
  const server: any = {
    to: jest.fn((channels: string | string[]) => ({
      emit: (event: string, payload: unknown) => emitted.push({ channels: [channels].flat(), event, payload }),
    })),
  };
  const chat: any = {
    getRoomFor: jest.fn().mockResolvedValue(ROOM),
    partnerIds: jest.fn().mockResolvedValue([MENTEE]),
    sendMessage: jest.fn((sender: string, roomId: string, body: string) =>
      Promise.resolve({ message: { id: 'm1', roomId, senderId: sender, body }, recipientId: MENTEE }),
    ),
    markRead: jest.fn().mockResolvedValue({ roomId: ROOM.id, readerId: MENTEE, participantId: MENTOR, readAt: new Date(), updated: 2 }),
  };
  const presence = new ChatPresence();
  const gateway = new ChatGateway(chat, {} as WsAuthService, presence);
  gateway.server = server;
  return { gateway, chat, presence, emitted };
}

describe('ChatGateway', () => {
  it('tracks presence and tells chat partners when a user comes online and goes offline', async () => {
    const { gateway, presence, emitted } = build();
    const a = socket(MENTOR);
    const b = socket(MENTOR);
    await gateway.handleConnection(a);
    await gateway.handleConnection(b);
    expect(a.join).toHaveBeenCalledWith(`user:${MENTOR}`);
    expect(presence.isOnline(MENTOR)).toBe(true);
    expect(emitted).toEqual([{ channels: [`user:${MENTEE}`], event: ChatEvents.PRESENCE, payload: { userId: MENTOR, online: true } }]);

    await gateway.handleDisconnect(a);
    expect(emitted).toHaveLength(1); // second tab still open
    await gateway.handleDisconnect(b);
    expect(emitted[1].payload).toEqual({ userId: MENTOR, online: false });
  });

  it('disconnects sockets that did not authenticate', async () => {
    const { gateway } = build();
    const anon = socket(MENTOR);
    anon.data = {};
    await gateway.handleConnection(anon);
    expect(anon.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins only rooms the user belongs to', async () => {
    const { gateway, chat } = build();
    const client = socket(MENTEE);
    expect(await gateway.join(client, { roomId: ROOM.id })).toEqual({ ok: true, roomId: ROOM.id, participantOnline: false });
    expect(client.rooms.has('chat:room-1')).toBe(true);

    chat.getRoomFor.mockRejectedValue(new ForbiddenException('nope'));
    expect(await gateway.join(client, { roomId: 'other' })).toEqual({ ok: false, status: 403, error: 'nope' });
  });

  it('delivers new messages to the room and both participants', async () => {
    const { gateway, emitted } = build();
    const ack = await gateway.send(socket(MENTOR), { roomId: ROOM.id, body: 'hi' });
    expect(ack).toMatchObject({ ok: true, message: { id: 'm1', body: 'hi' } });
    expect(emitted[0]).toMatchObject({
      channels: ['chat:room-1', `user:${MENTEE}`, `user:${MENTOR}`],
      event: ChatEvents.NEW_MESSAGE,
    });
  });

  it('acknowledges rate limiting as an error instead of throwing', async () => {
    const { gateway, chat, emitted } = build();
    chat.sendMessage.mockRejectedValue(new HttpException({ statusCode: 429, message: 'slow down' }, HttpStatus.TOO_MANY_REQUESTS));
    expect(await gateway.send(socket(MENTOR), { roomId: ROOM.id, body: 'spam' })).toEqual({ ok: false, status: 429, error: 'slow down' });
    expect(emitted).toHaveLength(0);
  });

  it('broadcasts read receipts to the sender', async () => {
    const { gateway, chat, emitted } = build();
    await gateway.markRead(socket(MENTEE), { roomId: ROOM.id });
    expect(emitted[0]).toMatchObject({ channels: ['chat:room-1', `user:${MENTOR}`], event: ChatEvents.READ_RECEIPT });

    chat.markRead.mockResolvedValue({ roomId: ROOM.id, readerId: MENTEE, participantId: MENTOR, readAt: new Date(), updated: 0 });
    await gateway.markRead(socket(MENTEE), { roomId: ROOM.id });
    expect(emitted).toHaveLength(1); // nothing new was read
  });

  it('relays typing indicators to the rest of a joined room only', async () => {
    const { gateway } = build();
    const client = socket(MENTEE);
    expect(await gateway.typing(client, { roomId: ROOM.id, isTyping: true })).toMatchObject({ ok: false });

    await gateway.join(client, { roomId: ROOM.id });
    expect(await gateway.typing(client, { roomId: ROOM.id, isTyping: true })).toEqual({ ok: true });
    expect(client.relayed).toEqual([
      { channel: 'chat:room-1', event: ChatEvents.TYPING, payload: { roomId: ROOM.id, userId: MENTEE, isTyping: true } },
    ]);
  });

  it('reports the online status of chat partners', async () => {
    const { gateway, presence } = build();
    presence.connect(MENTEE);
    expect(await gateway.presenceQuery(socket(MENTOR))).toEqual({ ok: true, online: { [MENTEE]: true } });
  });
});

describe('WebSocket authentication', () => {
  const config: any = {
    getOrThrow: () => 'test-secret-test-secret-test-secret',
    get: () => undefined,
  };
  const jwt = new JwtService({});
  const auth = new WsAuthService(jwt, config);
  const sign = (claims: object) =>
    jwt.signAsync(claims, { secret: config.getOrThrow(), issuer: 'skillsync', audience: 'skillsync-api', expiresIn: 60 });

  it('reads the token from auth, the Authorization header or the query string', () => {
    expect(extractToken({ auth: { token: 'a' } })).toBe('a');
    expect(extractToken({ auth: { token: 'Bearer b' } })).toBe('b');
    expect(extractToken({ headers: { authorization: 'Bearer c' } })).toBe('c');
    expect(extractToken({ query: { token: 'd' } })).toBe('d');
    expect(extractToken({ headers: { authorization: 'Basic x' } })).toBeNull();
  });

  it('accepts valid access tokens', async () => {
    const token = await sign({ sub: MENTOR, roles: [] });
    await expect(auth.authenticate({ auth: { token } })).resolves.toMatchObject({ sub: MENTOR });
  });

  it('rejects missing, forged and inactive-account tokens', async () => {
    await expect(auth.authenticate({})).rejects.toThrow(UnauthorizedException);
    const forged = await jwt.signAsync({ sub: MENTOR }, { secret: 'another-secret', issuer: 'skillsync', audience: 'skillsync-api' });
    await expect(auth.authenticate({ auth: { token: forged } })).rejects.toThrow(UnauthorizedException);
    const suspended = await sign({ sub: MENTOR, status: 'suspended' });
    await expect(auth.authenticate({ auth: { token: suspended } })).rejects.toThrow(UnauthorizedException);
  });
});
