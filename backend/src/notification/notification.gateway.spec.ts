import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway', () => {
  const userId = 'G'.repeat(56);
  let gateway: NotificationGateway;
  let jwt: { verifyAsync: jest.Mock };
  let redis: { exists: jest.Mock };
  let client: {
    handshake: { auth: Record<string, unknown>; headers: Record<string, string> };
    disconnect: jest.Mock;
    join: jest.Mock;
  };

  beforeEach(() => {
    jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        type: 'access',
        sub: userId,
        jti: 'token-id',
      }),
    };
    redis = { exists: jest.fn().mockResolvedValue(false) };
    client = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
    };
    gateway = new NotificationGateway(
      jwt as never,
      redis as never,
      { jwtSecret: 'test-secret' } as never,
    );
  });

  it('authenticates sockets and joins the recipient room', async () => {
    await gateway.handleConnection(client as never);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('access-token', {
      secret: 'test-secret',
    });
    expect(redis.exists).toHaveBeenCalledWith(expect.any(String), 'token-id');
    expect(client.join).toHaveBeenCalledWith(`user:${userId}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects sockets without an access token', async () => {
    client.handshake.auth = {};

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects blacklisted access tokens', async () => {
    redis.exists.mockResolvedValue(true);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects invalid access tokens', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });
});
