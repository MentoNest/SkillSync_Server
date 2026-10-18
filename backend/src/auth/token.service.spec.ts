import { TokenService } from './token.service';

const user = {
  id: 'u1',
  walletAddress: 'G' + 'A'.repeat(55),
  tokenVersion: 3,
};

function createService(configValues: Record<string, string> = {}) {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const config = { get: jest.fn((key: string) => configValues[key]) };
  const service = new TokenService(jwt as never, config as never);
  return { service, jwt, config };
}

describe('TokenService', () => {
  it('signs access token claims with the default TTL', async () => {
    const { service, jwt } = createService();
    const token = await service.signAccessToken(user as never);
    expect(token).toBe('signed-token');
    expect(service.accessTtlSeconds).toBe(900);
    const [claims, options] = jwt.signAsync.mock.calls[0];
    expect(claims).toEqual({
      sub: 'u1',
      wallet: user.walletAddress,
      roles: [],
      permissions: [],
      ver: 3,
      jti: expect.any(String),
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it('passes roles and permissions through and honours a custom TTL', async () => {
    const { service, jwt } = createService({ JWT_ACCESS_TTL_SECONDS: '60' });
    expect(service.accessTtlSeconds).toBe(60);
    await service.signAccessToken(user as never, ['mentor'], ['profile:read']);
    const [claims] = jwt.signAsync.mock.calls[0];
    expect(claims.roles).toEqual(['mentor']);
    expect(claims.permissions).toEqual(['profile:read']);
    expect(jwt.signAsync.mock.calls[0][1]).toEqual({ expiresIn: 60 });
  });
});
