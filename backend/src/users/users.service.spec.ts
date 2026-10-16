import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResourceNotFoundException } from '../common/exceptions/resource-not-found.exception';
import { RoleName } from '../rbac/roles';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

const WALLET = 'G' + 'A'.repeat(55);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    walletAddress: WALLET,
    email: null,
    displayName: null,
    status: 'active',
    avatarUrl: null,
    timezone: null,
    locale: null,
    lastLoginAt: null,
    tokenVersion: 0,
    roles: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createService() {
  const repo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((input: Partial<User>) => ({ roles: [], ...input }) as User),
    save: jest.fn(async (entity: User) => entity),
  };
  const service = new UsersService(repo as unknown as Repository<User>);
  return { service, repo };
}

describe('UsersService', () => {
  it('returns the user when found by id', async () => {
    const { service, repo } = createService();
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);
    await expect(service.findById('u1')).resolves.toBe(user);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'u1' }, relations: { roles: true } });
  });

  it('throws ResourceNotFoundException for a missing own profile', async () => {
    const { service, repo } = createService();
    repo.findOne.mockResolvedValue(null);
    await expect(service.getOwnProfile('missing')).rejects.toThrow(ResourceNotFoundException);
  });

  it('returns the existing user from findOrCreateByWallet', async () => {
    const { service, repo } = createService();
    const existing = makeUser();
    repo.findOne.mockResolvedValue(existing);
    const dto: CreateUserDto = { walletAddress: WALLET.toLowerCase() };
    await expect(service.findOrCreateByWallet(dto)).resolves.toBe(existing);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { walletAddress: WALLET },
      relations: { roles: true },
    });
  });

  it('creates a user when no existing or soft-deleted row is found', async () => {
    const { service, repo } = createService();
    const created = makeUser({ id: 'new' });
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repo.save.mockResolvedValue(created);
    const dto: CreateUserDto = { walletAddress: WALLET.toLowerCase(), email: 'a@example.com' };
    await service.findOrCreateByWallet(dto);
    expect(repo.create).toHaveBeenCalledWith({
      walletAddress: WALLET,
      email: 'a@example.com',
      displayName: null,
    });
    expect(repo.save).toHaveBeenCalledWith(created);
  });

  it('resurrects a soft-deleted user on login', async () => {
    const { service, repo } = createService();
    const deleted = makeUser({ status: 'deleted', deletedAt: new Date() });
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deleted);
    repo.save.mockImplementation(async (entity: User) => entity);
    const result = await service.findOrCreateByWallet({ walletAddress: WALLET });
    expect(result.status).toBe('active');
    expect(result.deletedAt).toBeNull();
    expect(repo.save).toHaveBeenCalled();
  });

  it('records the login timestamp', async () => {
    const { service, repo } = createService();
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);
    repo.save.mockImplementation(async (entity: User) => entity);
    const result = await service.recordLogin('u1');
    expect(result?.lastLoginAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(user);
  });

  it('skips recordLogin for an unknown user', async () => {
    const { service, repo } = createService();
    repo.findOne.mockResolvedValue(null);
    await expect(service.recordLogin('missing')).resolves.toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updates own profile fields', async () => {
    const { service, repo } = createService();
    const user = makeUser();
    repo.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    repo.save.mockImplementation(async (entity: User) => entity);
    const result = await service.updateOwnProfile('u1', {
      displayName: 'Alice',
      timezone: 'UTC',
      email: 'alice@example.com',
    });
    expect(result.displayName).toBe('Alice');
    expect(result.timezone).toBe('UTC');
    expect(result.email).toBe('alice@example.com');
    expect(repo.save).toHaveBeenCalledWith(user);
  });

  it('rejects an email that belongs to another user', async () => {
    const { service, repo } = createService();
    const user = makeUser();
    const other = makeUser({ id: 'u2', email: 'taken@example.com' });
    repo.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(other);
    await expect(
      service.updateOwnProfile('u1', { email: 'taken@example.com' }),
    ).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('soft-deletes the own profile', async () => {
    const { service, repo } = createService();
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);
    repo.save.mockImplementation(async (entity: User) => entity);
    const result = await service.deleteOwnProfile('u1');
    expect(result.status).toBe('deleted');
    expect(result.deletedAt).toBeInstanceOf(Date);
  });

  it('throws when deleting a missing profile', async () => {
    const { service, repo } = createService();
    repo.findOne.mockResolvedValue(null);
    await expect(service.deleteOwnProfile('missing')).rejects.toThrow(ResourceNotFoundException);
  });

  it('paginates search with the requested page and limit', async () => {
    const { service, repo } = createService();
    repo.findAndCount.mockResolvedValue([[makeUser()], 1]);
    const result = await service.searchUsers({ page: 2, limit: 10 });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(1);
    const options = repo.findAndCount.mock.calls[0][0];
    expect(options.skip).toBe(10);
    expect(options.take).toBe(10);
    expect(options.relations).toEqual({ roles: true });
  });

  it('defaults to page 1 and limit 20', async () => {
    const { service, repo } = createService();
    repo.findAndCount.mockResolvedValue([[], 0]);
    await service.searchUsers({});
    const options = repo.findAndCount.mock.calls[0][0];
    expect(options.skip).toBe(0);
    expect(options.take).toBe(20);
    expect(options.where).toEqual([{}]);
  });

  it('spreads role and status filters into every free-text condition', async () => {
    const { service, repo } = createService();
    repo.findAndCount.mockResolvedValue([[], 0]);
    await service.searchUsers({ q: 'alice', role: RoleName.MENTEE, status: 'active' });
    const options = repo.findAndCount.mock.calls[0][0];
    expect(Array.isArray(options.where)).toBe(true);
    expect(options.where).toHaveLength(3);
    for (const condition of options.where) {
      expect(condition.roles).toEqual({ name: RoleName.MENTEE });
      expect(condition.status).toBe('active');
    }
    expect(options.where.map((condition: Record<string, unknown>) => condition.displayName))
      .toHaveLength(3);
  });
});
