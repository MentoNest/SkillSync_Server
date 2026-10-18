import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { User } from '../../users/entities/user.entity';
import { SessionsService } from './sessions.service';
import type { SessionStore } from './session-store.port';

function createService(options: { user?: Partial<User> | null; revokedSessions?: number } = {}) {
  const user = options.user === undefined ? { id: 'u1', tokenVersion: 3 } : options.user;

  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    save: jest.fn(async (u: User) => u),
  };
  const store = {
    revokeAllForUser: jest.fn().mockResolvedValue(options.revokedSessions ?? 2),
    blacklistAccessToken: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SessionsService(
    users as unknown as Repository<User>,
    store as unknown as SessionStore,
    900,
  );
  return { service, users, store };
}

describe('SessionsService', () => {
  it('bumps the token version so previously issued access tokens stop validating', async () => {
    const { service, users } = createService();

    const result = await service.revokeAll('u1');

    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 4 }));
    expect(result.tokenVersion).toBe(4);
  });

  it('revokes every stored session for the user', async () => {
    const { service, store } = createService({ revokedSessions: 5 });

    const result = await service.revokeAll('u1');

    expect(store.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(result.revokedSessions).toBe(5);
  });

  it('blacklists the caller current token when a jti is supplied', async () => {
    const { service, store } = createService();

    await service.revokeAll('u1', 'jti-current');

    expect(store.blacklistAccessToken).toHaveBeenCalledWith('jti-current', 900);
  });

  it('skips blacklisting when no jti is supplied', async () => {
    const { service, store } = createService();

    await service.revokeAll('u1');

    expect(store.blacklistAccessToken).not.toHaveBeenCalled();
  });

  it('throws when the user does not exist and changes nothing', async () => {
    const { service, users, store } = createService({ user: null });

    await expect(service.revokeAll('ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(users.save).not.toHaveBeenCalled();
    expect(store.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('reports the bumped version on a user that had no active sessions', async () => {
    const { service } = createService({ revokedSessions: 0 });

    await expect(service.revokeAll('u1')).resolves.toEqual({ revokedSessions: 0, tokenVersion: 4 });
  });

  it('increments monotonically across repeated revocations', async () => {
    const { service } = createService();
    const user = { id: 'u1', tokenVersion: 0 };

    const first = await service.revokeAll('u1');
    user.tokenVersion = first.tokenVersion;
    const second = await service.revokeAll('u1');

    expect(second.tokenVersion).toBe(first.tokenVersion + 1);
  });
});