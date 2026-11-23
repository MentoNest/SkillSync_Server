import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Role } from '../../auth/auth.types';
import { RedisNamespace } from '../../redis/redis.config';
import { ProfileUpdateRateLimitGuard } from '../profile-update-rate-limit.guard';

function context(user?: { address: string; roles: Role[] }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProfileUpdateRateLimitGuard', () => {
  const redis = {
    incrementWithExpiry: jest.fn(),
  };
  let guard: ProfileUpdateRateLimitGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ProfileUpdateRateLimitGuard(redis as never);
  });

  it('counts profile updates per authenticated user for one hour', async () => {
    redis.incrementWithExpiry.mockResolvedValue(1);

    await expect(
      guard.canActivate(context({ address: 'GABC', roles: [Role.USER] })),
    ).resolves.toBe(true);
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      RedisNamespace.RATE_LIMIT,
      'profile-update:gabc',
      3600,
    );
  });

  it('allows the 30th request and rejects the 31st', async () => {
    const ctx = context({ address: 'GABC', roles: [Role.USER] });
    redis.incrementWithExpiry
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(31);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
  });

  it('rejects requests without an authenticated user', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
  });
});
