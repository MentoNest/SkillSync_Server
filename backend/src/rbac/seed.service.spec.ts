import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { User } from '../users/entities/user.entity';
import type { Role } from './entities/role.entity';
import { SeedService } from './seed.service';
import { DEFAULT_ROLE_PERMISSIONS, RoleName } from './roles';

const ADMIN_WALLET = 'G' + 'B'.repeat(55);

function createService(options: { adminWallet?: string | undefined; existingRoles?: Partial<Role>[] } = {}) {
  const seededRoles = options.existingRoles ?? [];

  const roles = {
    findOne: jest.fn(async ({ where }: { where: { name: RoleName } }) =>
      seededRoles.find((r) => r.name === where.name) ?? null,
    ),
    findOneOrFail: jest.fn(async ({ where }: { where: { name: RoleName } }) => {
      const found = seededRoles.find((r) => r.name === where.name);
      if (!found) throw new Error(`Role ${where.name} not found`);
      return found;
    }),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };

  const users = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (u: User) => u),
  };

  const config = {
    get: (key: string) => (key === 'ADMIN_WALLET_ADDRESS' ? options.adminWallet : undefined),
  };

  const service = new SeedService(
    roles as unknown as Repository<Role>,
    users as unknown as Repository<User>,
    config as unknown as ConfigService,
  );
  return { service, roles, users };
}

describe('SeedService', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('roles', () => {
    it('creates every role that does not exist yet', async () => {
      const { service, roles } = createService();

      await service.onApplicationBootstrap();

      expect(roles.save).toHaveBeenCalledTimes(Object.values(RoleName).length);
      for (const name of Object.values(RoleName)) {
        expect(roles.create).toHaveBeenCalledWith({ name, permissions: DEFAULT_ROLE_PERMISSIONS[name] });
      }
    });

    it('does not recreate a role that already exists', async () => {
      const { service, roles } = createService({
        existingRoles: [
          { id: 'r1', name: RoleName.ADMIN, permissions: [] },
          { id: 'r2', name: RoleName.MENTOR, permissions: [] },
          { id: 'r3', name: RoleName.MENTEE, permissions: [] },
        ],
      });

      await service.onApplicationBootstrap();

      expect(roles.save).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Seeded role'));
    });

    it('is idempotent across repeated bootstraps', async () => {
      const { service, roles } = createService();

      await service.onApplicationBootstrap();
      // Simulate the rows now existing.
      seededAll(roles);

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('admin user', () => {
    it('creates the admin user when the wallet does not exist yet', async () => {
      const { service, users } = createService({ adminWallet: ADMIN_WALLET });

      await service.onApplicationBootstrap();

      expect(users.create).toHaveBeenCalledWith({ walletAddress: ADMIN_WALLET, roles: [] });
      expect(users.save).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Seeded admin user');
    });

    it('normalises the configured wallet to upper case', async () => {
      const { service, users } = createService({ adminWallet: `  ${ADMIN_WALLET.toLowerCase()}  ` });

      await service.onApplicationBootstrap();

      expect(users.create).toHaveBeenCalledWith({ walletAddress: ADMIN_WALLET, roles: [] });
    });

    it('adds the admin role to an existing user that lacks it', async () => {
      const admin = { id: 'role-admin', name: RoleName.ADMIN, permissions: [] };
      const { service, users } = createService({ adminWallet: ADMIN_WALLET, existingRoles: [admin] });
      users.findOne.mockResolvedValue({ id: 'u1', walletAddress: ADMIN_WALLET, roles: [] });

      await service.onApplicationBootstrap();

      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ roles: [admin] }));
    });

    it('does not re-add the admin role when the user already has it', async () => {
      const admin = { id: 'role-admin', name: RoleName.ADMIN, permissions: [] };
      const { service, users } = createService({ adminWallet: ADMIN_WALLET, existingRoles: [admin] });
      users.findOne.mockResolvedValue({ id: 'u1', walletAddress: ADMIN_WALLET, roles: [admin] });

      await service.onApplicationBootstrap();

      expect(users.save).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalledWith('Seeded admin user');
    });

    it('warns and skips the admin user when ADMIN_WALLET_ADDRESS is unset', async () => {
      const { service, users } = createService();

      await service.onApplicationBootstrap();

      expect(users.save).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('ADMIN_WALLET_ADDRESS not set; skipping admin user seed');
    });

    it('treats a blank ADMIN_WALLET_ADDRESS as unset', async () => {
      const { service, users } = createService({ adminWallet: '   ' });

      await service.onApplicationBootstrap();

      expect(users.save).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });
  });
});

/** Marks every role as present so the second bootstrap sees a fully seeded DB. */
function seededAll(rolesRepo: { findOne: jest.Mock }): void {
  const all = Object.values(RoleName).map((name, i) => ({ id: `r${i}`, name, permissions: [] }));
  rolesRepo.findOne.mockImplementation(async ({ where }: { where: { name: RoleName } }) =>
    all.find((r) => r.name === where.name) ?? null,
  );
}