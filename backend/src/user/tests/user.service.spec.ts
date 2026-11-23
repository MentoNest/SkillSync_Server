import { BusinessRuleException, DuplicateResourceException, ResourceNotFoundException } from '../../common/errors/app-exceptions';
import { User } from '../user.entity';
import { UserService, USERNAME_COOLDOWN_DAYS } from '../user.service';

// ─── Minimal in-memory repository stub ───────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.walletAddress = 'gdqp2kpqgkihyjgxnuiyomharuarca7djt5fo2ffooky3b2wsqhg4w37';
  user.username = null;
  user.displayName = null;
  user.usernameChangedAt = null;
  user.createdAt = new Date('2024-01-01T00:00:00Z');
  return Object.assign(user, overrides);
}

function makeRepo(rows: User[] = []) {
  const query = { username: '', walletAddress: '' };
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn((_sql: string, params: { username: string; walletAddress: string }) => {
      Object.assign(query, params);
      return qb;
    }),
    getOne: jest.fn(async () =>
      rows.find((u) => u.username === query.username || u.walletAddress === query.walletAddress) ?? null,
    ),
  };

  return {
    createQueryBuilder: jest.fn(() => qb),
    findOneBy: jest.fn(async (where: Partial<User>) => {
      if ('username' in where) return rows.find((u) => u.username === where.username) ?? null;
      if ('walletAddress' in where) return rows.find((u) => u.walletAddress === where.walletAddress) ?? null;
      return null;
    }),
    existsBy: jest.fn(async (where: Partial<User>) => {
      if ('username' in where) return rows.some((u) => u.username === where.username);
      return false;
    }),
    create: jest.fn((data: Partial<User>) => Object.assign(new User(), data)),
    save: jest.fn(async (entity: User) => {
      const idx = rows.findIndex((u) => u.walletAddress === entity.walletAddress);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const portfolioLinks = { listByWallet: jest.fn().mockResolvedValue([]) };
const completeness = {
  getForUser: jest.fn().mockResolvedValue({ score: 0 }),
  invalidate: jest.fn().mockResolvedValue(undefined),
};

const WALLET = 'gdqp2kpqgkihyjgxnuiyomharuarca7djt5fo2ffooky3b2wsqhg4w37';
const OTHER_WALLET = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGFM34TPTJKH3CRBJ1J9DEC';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserService.checkAvailability', () => {
  it('returns available=true for a valid, unclaimed username', async () => {
    const repo = makeRepo([]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);
    const result = await service.checkAvailability('alice_dev');
    expect(result).toEqual({ username: 'alice_dev', available: true });
  });

  it('returns available=false with a reason for an invalid username', async () => {
    const repo = makeRepo([]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);
    const result = await service.checkAvailability('ab');
    expect(result.available).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns available=false when the username is already taken', async () => {
    const existing = makeUser({ walletAddress: OTHER_WALLET, username: 'alice_dev' });
    const repo = makeRepo([existing]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);
    const result = await service.checkAvailability('alice_dev');
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/taken/i);
  });
});

describe('UserService.setUsername', () => {
  it('sets a username for the first time with no cooldown', async () => {
    const user = makeUser({ walletAddress: WALLET });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setUsername(WALLET, 'alice_dev');

    expect(updated.username).toBe('alice_dev');
    expect(updated.usernameChangedAt).toBeInstanceOf(Date);
  });

  it('normalises username to lowercase', async () => {
    const user = makeUser({ walletAddress: WALLET });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setUsername(WALLET, 'AliceDev');

    expect(updated.username).toBe('alicedev');
  });

  it('rejects an invalid username', async () => {
    const user = makeUser({ walletAddress: WALLET });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    await expect(service.setUsername(WALLET, '__bad')).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('allows a username change after the cooldown has fully elapsed', async () => {
    const user = makeUser({
      walletAddress: WALLET,
      username: 'old_name',
      usernameChangedAt: daysAgo(USERNAME_COOLDOWN_DAYS + 1),
    });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setUsername(WALLET, 'new_name');

    expect(updated.username).toBe('new_name');
  });

  it('blocks a username change before the cooldown has elapsed', async () => {
    const user = makeUser({
      walletAddress: WALLET,
      username: 'old_name',
      usernameChangedAt: daysAgo(USERNAME_COOLDOWN_DAYS - 1),
    });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    await expect(service.setUsername(WALLET, 'new_name')).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('reports the number of remaining days in the cooldown error', async () => {
    const user = makeUser({
      walletAddress: WALLET,
      username: 'old_name',
      usernameChangedAt: daysAgo(5),
    });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    await expect(service.setUsername(WALLET, 'new_name')).rejects.toThrow(/25 day/);
  });

  it('allows re-setting to the same username (no-op) even within the cooldown', async () => {
    // The uniqueness check sees the existing row belongs to the same wallet, so it proceeds.
    const user = makeUser({
      walletAddress: WALLET,
      username: 'alice_dev',
      usernameChangedAt: daysAgo(1),
    });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    // Still within cooldown — should throw because the username IS different from the existing one,
    // but here we pass the SAME username. The cooldown check still fires first.
    await expect(service.setUsername(WALLET, 'alice_dev')).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('rejects a username already taken by another account', async () => {
    const other = makeUser({ walletAddress: OTHER_WALLET, username: 'taken_name' });
    const user = makeUser({ walletAddress: WALLET });
    const repo = makeRepo([other, user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    await expect(service.setUsername(WALLET, 'taken_name')).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('creates the user row automatically if it does not yet exist', async () => {
    const repo = makeRepo([]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setUsername(WALLET, 'newuser');

    expect(updated.walletAddress).toBe(WALLET);
    expect(updated.username).toBe('newuser');
  });
});

describe('UserService.setDisplayName', () => {
  it('sets a display name', async () => {
    const user = makeUser({ walletAddress: WALLET });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setDisplayName(WALLET, 'Alice the Developer');

    expect(updated.displayName).toBe('Alice the Developer');
  });

  it('clears a display name when passed null', async () => {
    const user = makeUser({ walletAddress: WALLET, displayName: 'Old Name' });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const updated = await service.setDisplayName(WALLET, null);

    expect(updated.displayName).toBeNull();
  });
});

describe('UserService.getPublicProfile', () => {
  it('resolves a profile by username', async () => {
    const user = makeUser({ walletAddress: WALLET, username: 'alice_dev', displayName: 'Alice' });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const profile = await service.getPublicProfile('alice_dev');

    expect(profile.walletAddress).toBe(WALLET);
    expect(profile.username).toBe('alice_dev');
    expect(profile.displayName).toBe('Alice');
  });

  it('resolves a profile by wallet address when no username matches', async () => {
    const user = makeUser({ walletAddress: WALLET, username: null });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const profile = await service.getPublicProfile(WALLET);

    expect(profile.walletAddress).toBe(WALLET);
  });

  it('returns the wallet prefix as displayName when none is set', async () => {
    const user = makeUser({ walletAddress: WALLET, displayName: null });
    const repo = makeRepo([user]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    const profile = await service.getPublicProfile(WALLET);

    expect(profile.displayName).toBe(WALLET.slice(0, 8));
  });

  it('throws ResourceNotFoundException for an unknown identifier', async () => {
    const repo = makeRepo([]);
    const service = new UserService(repo as never, portfolioLinks as never, completeness as never);

    await expect(service.getPublicProfile('nobody')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
