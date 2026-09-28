import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminSeedService } from './admin-seed.service';
import { User, ProfileType, UserStatus } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';
import { RoleName } from '../rbac/role-permissions';

describe('AdminSeedService (#1319)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: AdminSeedService;
  let userRepository: any;
  let roleRepository: any;
  let queryBuilder: { insert: any; into: any; values: any; orIgnore: any; execute: any };
  let dataSource: { transaction: any };

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DISABLE_SEED;
    delete process.env.TEST_ADMIN_WALLET;
    delete process.env.DEFAULT_ADMIN_WALLET;
    process.env.NODE_ENV = 'test';

    queryBuilder = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ raw: [] }),
    };

    userRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => data),
      save: vi.fn(async (user: any) => ({ id: 'admin-1', ...user })),
    };
    roleRepository = {
      findOne: vi.fn().mockImplementation(async ({ where }: any) =>
        where.name === RoleName.ADMIN ? { id: 'role-admin', name: RoleName.ADMIN } : null,
      ),
      save: vi.fn(async (role: any) => role),
    };

    const manager = {
      getRepository: vi.fn((entity: any) =>
        entity === User ? userRepository : roleRepository,
      ),
      createQueryBuilder: vi.fn(() => queryBuilder),
    };
    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    const module = await Test.createTestingModule({
      providers: [AdminSeedService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    service = module.get(AdminSeedService);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('seed()', () => {
    it('creates the predefined roles and the bootstrap administrator', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMINWALLETADDRESS';

      const result = await service.seed();

      expect(result.skipped).toBe(false);
      expect(result.adminCreated).toBe(true);
      expect(result.adminWallet).toBe('gadminwalletaddress');
      // The mock only has the `admin` role row, so mentor and mentee are the
      // roles this run actually has to insert.
      expect(result.rolesCreated).toEqual([RoleName.MENTOR, RoleName.MENTEE]);
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: 'gadminwalletaddress',
          profileType: ProfileType.ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );
    });

    it('normalises the wallet address to lower case', async () => {
      process.env.TEST_ADMIN_WALLET = '  gMiXeDcaseWaLlet  ';

      const result = await service.seed();

      expect(result.adminWallet).toBe('gmixedcasewallet');
    });

    it('assigns the admin role to the seeded user', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';

      await service.seed();

      const junctionInsert = queryBuilder.values.mock.calls.find(
        ([values]: [any]) => values?.userId === 'admin-1',
      );
      expect(junctionInsert).toBeDefined();
      expect(junctionInsert[0]).toEqual({ userId: 'admin-1', roleId: 'role-admin' });
    });

    it('uses ON CONFLICT DO NOTHING so a second run cannot duplicate rows', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';

      await service.seed();

      expect(queryBuilder.orIgnore).toHaveBeenCalled();
    });

    it('is idempotent: an existing admin is neither recreated nor re-reported', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';
      userRepository.findOne.mockResolvedValue({ id: 'existing-1', tokenVersion: 0 });

      const result = await service.seed();

      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result.adminCreated).toBe(false);
      expect(result.adminUserId).toBe('existing-1');
      expect(result.message).toBe('Admin already exists');
    });

    it('still seeds the roles when no admin wallet is configured', async () => {
      const result = await service.seed();

      expect(result.rolesCreated.length).toBeGreaterThan(0);
      expect(result.adminCreated).toBe(false);
      expect(result.adminWallet).toBeNull();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('skips everything when DISABLE_SEED=true', async () => {
      process.env.DISABLE_SEED = 'true';
      process.env.TEST_ADMIN_WALLET = 'GADMIN';

      const result = await service.seed();

      expect(result).toMatchObject({ skipped: true, skipReason: 'DISABLE_SEED' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('prefers the test wallet over the production one', async () => {
      process.env.DEFAULT_ADMIN_WALLET = 'GPRODUCTION';
      process.env.TEST_ADMIN_WALLET = 'GTESTONLY';

      const result = await service.seed();

      expect(result.adminWallet).toBe('gtestonly');
    });

    it('falls back to DEFAULT_ADMIN_WALLET in the test environment', async () => {
      process.env.DEFAULT_ADMIN_WALLET = 'GPRODUCTION';

      const result = await service.seed();

      expect(result.adminWallet).toBe('gproduction');
    });

    it('uses DEFAULT_ADMIN_WALLET outside the test environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DEFAULT_ADMIN_WALLET = 'GPRODUCTION';
      process.env.TEST_ADMIN_WALLET = 'GTESTONLY';

      const result = await service.seed();

      expect(result.adminWallet).toBe('gproduction');
    });

    it('backfills permissions on a role row that has none', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';
      roleRepository.findOne.mockImplementation(async ({ where }: any) =>
        where.name === RoleName.ADMIN
          ? { id: 'role-admin', name: RoleName.ADMIN, permissions: [], isSystem: false }
          : null,
      );

      await service.seed();

      expect(roleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RoleName.ADMIN,
          isSystem: true,
          permissions: expect.arrayContaining(['*']),
        }),
      );
    });

    it('never throws: a database failure is reported, not propagated', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';
      dataSource.transaction.mockRejectedValueOnce(new Error('db down'));

      const result = await service.seed();

      expect(result.skipped).toBe(true);
      expect(result.message).toContain('db down');
    });

    it('refuses to create an admin when the admin role row is missing', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';
      roleRepository.findOne.mockResolvedValue(null);

      const result = await service.seed();

      expect(result.skipped).toBe(true);
      expect(result.message).toContain('the role row is missing');
    });

    it('runs on application bootstrap', async () => {
      process.env.TEST_ADMIN_WALLET = 'GADMIN';

      await service.onApplicationBootstrap();

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Role.defaultPermissionsFor()', () => {
    it('gives admin the wildcard and mentees nothing extra', () => {
      expect(Role.defaultPermissionsFor(RoleName.ADMIN)).toEqual(['*']);
      expect(Role.defaultPermissionsFor(RoleName.MENTOR)).toContain('session:update');
      expect(Role.defaultPermissionsFor('unknown')).toEqual([]);
    });
  });
});
