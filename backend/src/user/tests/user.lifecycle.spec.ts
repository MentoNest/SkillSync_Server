import { Keypair } from '@stellar/stellar-sdk';
import {
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../common/errors/app-exceptions';
import { User } from '../user.entity';
import { UserStatus } from '../user-status.enum';
import { UserService } from '../user.service';

const WALLET = 'gdqp2kpqgkihyjgxnuiyomharuarca7djt5fo2ffooky3b2wsqhg4w37';
const OTHER = Keypair.random().publicKey().toLowerCase();
const UNKNOWN = Keypair.random().publicKey().toLowerCase();

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.walletAddress = WALLET;
  user.email = null;
  user.username = null;
  user.displayName = null;
  user.status = UserStatus.ACTIVE;
  user.avatarUrl = null;
  user.timezone = 'UTC';
  user.locale = 'en';
  user.usernameChangedAt = null;
  user.lastLoginAt = null;
  user.deletedAt = null;
  user.createdAt = new Date('2026-01-01T00:00:00.000Z');
  user.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return Object.assign(user, overrides);
}

function matches(user: User, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => (user as unknown as Record<string, unknown>)[key] === value);
}

function makeRepo(rows: User[] = []) {
  const query = {
    where: {} as Record<string, unknown>,
    search: undefined as string | undefined,
    skip: 0,
    take: 20,
  };

  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn((where: Record<string, unknown>) => {
      query.where = where;
      return qb;
    }),
    andWhere: jest.fn((_sql: string, params?: { q?: string }) => {
      query.search = params?.q?.replace(/%/g, '');
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn((value: number) => {
      query.skip = value;
      return qb;
    }),
    take: jest.fn((value: number) => {
      query.take = value;
      return qb;
    }),
    getManyAndCount: jest.fn(async () => {
      const filtered = rows.filter((row) => {
        if (row.deletedAt) return false;
        if (!matches(row, query.where)) return false;
        if (!query.search) return true;
        return (
          row.username?.toLowerCase().includes(query.search.toLowerCase()) ||
          row.displayName?.toLowerCase().includes(query.search.toLowerCase()) ||
          false
        );
      });
      return [filtered.slice(query.skip, query.skip + query.take), filtered.length];
    }),
  };

  return {
    findOneBy: jest.fn(async (where: Record<string, unknown>) => {
      return rows.find((row) => !row.deletedAt && matches(row, where)) ?? null;
    }),
    findOne: jest.fn(async (options: { where: Record<string, unknown>; withDeleted?: boolean }) => {
      const row = rows.find((candidate) => matches(candidate, options.where));
      if (!row || (!options.withDeleted && row.deletedAt)) return null;
      return row;
    }),
    existsBy: jest.fn(async (where: Record<string, unknown>) => {
      return rows.some((row) => !row.deletedAt && matches(row, where));
    }),
    create: jest.fn((data: Partial<User>) => Object.assign(makeUser(), data)),
    save: jest.fn(async (entity: User) => {
      const index = rows.findIndex((row) => row.walletAddress === entity.walletAddress);
      if (index >= 0) rows[index] = entity;
      else rows.push(entity);
      return entity;
    }),
    softDelete: jest.fn(async (criteria: Record<string, unknown>) => {
      const row = rows.find((candidate) => matches(candidate, criteria));
      if (row) row.deletedAt = new Date('2026-02-01T00:00:00.000Z');
      return { affected: row ? 1 : 0 };
    }),
    restore: jest.fn(async (criteria: Record<string, unknown>) => {
      const row = rows.find((candidate) => matches(candidate, criteria));
      if (row) row.deletedAt = null;
      return { affected: row ? 1 : 0 };
    }),
    createQueryBuilder: jest.fn(() => qb),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  const portfolioLinks = { listByWallet: jest.fn().mockResolvedValue([]) };
  const completeness = {
    getForUser: jest.fn().mockResolvedValue({ score: 0 }),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };
  return new UserService(repo as never, portfolioLinks as never, completeness as never);
}

describe('UserService lifecycle rules', () => {
  it('normalises email and rejects duplicate wallet or email addresses', async () => {
    const existing = makeUser({ walletAddress: OTHER, email: 'taken@example.com' });
    const repo = makeRepo([existing]);
    const service = makeService(repo);

    const created = await service.create({
      walletAddress: ` ${WALLET.toLowerCase()} `,
      email: 'Alice@Example.COM',
    });

    expect(created.email).toBe('alice@example.com');
    expect(created.timezone).toBe('UTC');
    expect(created.walletAddress).toBe(WALLET.toLowerCase());
    expect(repo.findOneBy).toHaveBeenCalledWith({ walletAddress: WALLET.toLowerCase() });
    await expect(
      service.create({ walletAddress: OTHER, displayName: 'Duplicate' }),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
    await expect(
      service.create({ walletAddress: WALLET, email: 'TAKEN@example.com' }),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('rejects updating a profile to an email owned by another account', async () => {
    const mine = makeUser({ walletAddress: WALLET });
    const theirs = makeUser({ walletAddress: OTHER, email: 'owner@example.com' });
    const repo = makeRepo([mine, theirs]);
    const service = makeService(repo);

    await expect(service.updateMe(WALLET, { email: 'OWNER@example.com' })).rejects.toBeInstanceOf(
      DuplicateResourceException,
    );
    await expect(service.updateMe(WALLET, { email: 'mine@example.com' })).resolves.toMatchObject({
      email: 'mine@example.com',
    });
  });

  it('soft deletes the account and refuses to delete an unknown wallet', async () => {
    const repo = makeRepo([makeUser()]);
    const service = makeService(repo);

    await service.removeMe(WALLET);

    expect(repo.softDelete).toHaveBeenCalledWith({ walletAddress: WALLET });
    expect(await repo.findOneBy({ walletAddress: WALLET })).toBeNull();
    await expect(service.removeMe(UNKNOWN)).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('suspends an active account without hiding it from soft-delete queries', async () => {
    const repo = makeRepo([makeUser()]);
    const service = makeService(repo);

    const updated = await service.setStatus(WALLET, UserStatus.SUSPENDED);

    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(await repo.findOneBy({ walletAddress: WALLET })).toMatchObject({
      status: UserStatus.SUSPENDED,
    });
  });

  it('restores a soft-deleted account and marks it active', async () => {
    const deleted = makeUser({ status: UserStatus.DELETED, deletedAt: new Date() });
    const repo = makeRepo([deleted]);
    const service = makeService(repo);

    const restored = await service.restore(WALLET);

    expect(repo.restore).toHaveBeenCalledWith({ walletAddress: WALLET });
    expect(restored.status).toBe(UserStatus.ACTIVE);
    expect(await repo.findOneBy({ walletAddress: WALLET })).not.toBeNull();
  });

  it('soft deletes when an admin sets the status to deleted', async () => {
    const repo = makeRepo([makeUser()]);
    const service = makeService(repo);

    const result = await service.setStatus(WALLET, UserStatus.DELETED);

    expect(result.status).toBe(UserStatus.DELETED);
    expect(repo.softDelete).toHaveBeenCalledWith({ walletAddress: WALLET });
  });

  it('filters by status and search text and applies pagination', async () => {
    const rows = [
      makeUser({ walletAddress: WALLET, username: 'alice_dev', displayName: 'Alice' }),
      makeUser({ walletAddress: OTHER, username: 'bob_dev', displayName: 'Bob', status: UserStatus.SUSPENDED }),
      makeUser({ walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', username: 'carol' }),
    ];
    const repo = makeRepo(rows);
    const service = makeService(repo);

    const page = await service.findAll({
      status: UserStatus.ACTIVE,
      search: 'dev',
      page: 1,
      limit: 1,
    });

    expect(page.total).toBe(1);
    expect(page.data).toHaveLength(1);
    expect(page.data[0].username).toBe('alice_dev');
    expect(page).toMatchObject({ page: 1, limit: 1 });
  });

  it('propagates repository failures instead of returning stale data', async () => {
    const repo = makeRepo([makeUser()]);
    repo.save.mockRejectedValueOnce(new Error('database unavailable'));
    const service = makeService(repo);

    await expect(service.updateMe(WALLET, { displayName: 'New' })).rejects.toThrow(
      'database unavailable',
    );
  });
});
