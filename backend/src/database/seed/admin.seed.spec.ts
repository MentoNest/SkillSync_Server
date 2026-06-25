import { DataSource, QueryRunner, Repository } from 'typeorm';
import { seedAdmin } from './admin.seed';
import { User } from '../../entities/user.entity';

// ---------------------------------------------------------------------------
// Helpers to build a lightweight mock DataSource / QueryRunner
// ---------------------------------------------------------------------------

const TEST_WALLET = 'TEST_ADMIN_WALLET_ADDRESS_12345678901234';

function buildMockQueryRunner(existingUser: Partial<User> | null): {
  queryRunner: jest.Mocked<QueryRunner>;
  userRepository: jest.Mocked<Repository<User>>;
} {
  const savedEntities: Partial<User>[] = existingUser ? [{ ...existingUser }] : [];

  const qb: any = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(existingUser ? { ...existingUser } : null),
  };

  const userRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation(async (entity) => {
      savedEntities.push(entity);
      return entity;
    }),
  } as unknown as jest.Mocked<Repository<User>>;

  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      getRepository: jest.fn().mockReturnValue(userRepository),
    },
  } as unknown as jest.Mocked<QueryRunner>;

  return { queryRunner, userRepository };
}

function buildMockDataSource(
  existingUser: Partial<User> | null,
): { dataSource: jest.Mocked<DataSource>; queryRunner: jest.Mocked<QueryRunner>; userRepository: jest.Mocked<Repository<User>> } {
  const { queryRunner, userRepository } = buildMockQueryRunner(existingUser);

  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  } as unknown as jest.Mocked<DataSource>;

  return { dataSource, queryRunner, userRepository };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedAdmin', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset to a clean env clone before each test
    process.env = {
      ...originalEnv,
      DEFAULT_ADMIN_WALLET: TEST_WALLET,
      DISABLE_SEED: undefined as unknown as string,
      NODE_ENV: 'test',
    };
    // Remove undefined keys
    delete process.env.DISABLE_SEED;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  it('should skip seeding when DISABLE_SEED=true', async () => {
    process.env.DISABLE_SEED = 'true';

    const { dataSource } = buildMockDataSource(null);
    await seedAdmin(dataSource);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('should skip seeding when DEFAULT_ADMIN_WALLET is not set', async () => {
    delete process.env.DEFAULT_ADMIN_WALLET;

    const { dataSource } = buildMockDataSource(null);
    await seedAdmin(dataSource);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('should create admin user when none exists', async () => {
    const { dataSource, queryRunner, userRepository } = buildMockDataSource(null);

    await seedAdmin(dataSource);

    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: TEST_WALLET,
        roles: expect.arrayContaining(['admin']),
        permissions: expect.arrayContaining(['*']),
      }),
    );
    expect(userRepository.save).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('should rollback (not insert) when admin already exists with full permissions', async () => {
    const existingAdmin: Partial<User> = {
      id: 'uuid-1',
      wallet: TEST_WALLET,
      roles: ['admin'],
      permissions: [
        'user:read', 'user:write', 'user:delete',
        'role:read', 'role:write', 'role:delete',
        'audit:read', '*',
      ],
    };

    const { dataSource, queryRunner, userRepository } = buildMockDataSource(existingAdmin);

    await seedAdmin(dataSource);

    // Nothing was saved and the transaction was rolled back (nothing to commit)
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('should patch existing user missing the admin role', async () => {
    const existingAdmin: Partial<User> = {
      id: 'uuid-2',
      wallet: TEST_WALLET,
      roles: ['user'],           // missing admin role
      permissions: ['user:read'],
    };

    const { dataSource, queryRunner, userRepository } = buildMockDataSource(existingAdmin);

    await seedAdmin(dataSource);

    expect(userRepository.save).toHaveBeenCalledTimes(1);
    const savedUser: Partial<User> = userRepository.save.mock.calls[0][0];
    expect(savedUser.roles).toContain('admin');
    expect(savedUser.permissions).toContain('*');
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  it('should rollback transaction and rethrow on database error', async () => {
    const { dataSource, queryRunner, userRepository } = buildMockDataSource(null);

    userRepository.save.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(seedAdmin(dataSource)).rejects.toThrow('DB connection lost');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  it('always releases the query runner even on error', async () => {
    const { dataSource, queryRunner, userRepository } = buildMockDataSource(null);

    userRepository.save.mockRejectedValueOnce(new Error('Unexpected error'));

    try {
      await seedAdmin(dataSource);
    } catch {
      // expected
    }

    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  it('assigns all ADMIN_PERMISSIONS to the new user', async () => {
    const { dataSource, userRepository } = buildMockDataSource(null);

    await seedAdmin(dataSource);

    const createdUser: Partial<User> = userRepository.create.mock.calls[0][0];
    expect(createdUser.permissions).toEqual(
      expect.arrayContaining([
        'user:read', 'user:write', 'user:delete',
        'role:read', 'role:write', 'role:delete',
        'audit:read', '*',
      ]),
    );
  });
});
