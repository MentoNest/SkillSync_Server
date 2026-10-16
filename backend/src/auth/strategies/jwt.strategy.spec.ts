import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function createStrategy() {
  const jwt = { verifyAsync: jest.fn() };
  const config = {
    getOrThrow: jest.fn(() => 'secret'),
    get: jest.fn(() => undefined),
  };
  const strategy = new JwtStrategy(jwt as never, config as never);
  return { strategy, jwt, config };
}

describe('JwtStrategy', () => {
  it('verifies with the configured secret, issuer and audience', async () => {
    const { strategy, jwt, config } = createStrategy();
    const payload = { sub: 'u1', wallet: 'W', roles: [], permissions: [], jti: 'j' };
    jwt.verifyAsync.mockResolvedValue(payload);

    await expect(strategy.validate('token')).resolves.toBe(payload);
    expect(config.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
    expect(jwt.verifyAsync).toHaveBeenCalledWith('token', {
      secret: 'secret',
      issuer: 'skillsync',
      audience: 'skillsync-api',
      algorithms: ['HS256'],
    });
  });

  it('maps verification failures to UnauthorizedException', async () => {
    const { strategy, jwt } = createStrategy();
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(strategy.validate('token')).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate('token')).rejects.toThrow('Invalid or expired token');
  });
});
