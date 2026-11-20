import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AdminSeedService } from './admin-seed.service';

describe('AdminSeedService', () => {
  const wallet = 'GTESTADMINWALLET';

  function setup({
    env = { DEFAULT_ADMIN_WALLET: wallet },
    userInserted = false,
  }: {
    env?: Record<string, string>;
    userInserted?: boolean;
  } = {}) {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO users')) return userInserted ? [{ wallet_address: wallet }] : [];
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const transaction = jest.fn((callback: (manager: EntityManager) => Promise<boolean>) =>
      callback(manager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    const service = new AdminSeedService(dataSource, config);
    return { service, query, transaction };
  }

  it('creates the full-permission admin role and assigns a new configured wallet atomically', async () => {
    const { service, query, transaction } = setup({ userInserted: true });
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation();

    await service.onApplicationBootstrap();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (name) DO NOTHING');
    expect(query.mock.calls[0][1]).toEqual(['admin', '["*"]']);
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT (wallet_address) DO NOTHING');
    expect(query.mock.calls[1][1]).toEqual([wallet]);
    expect(query.mock.calls[2][0]).toContain('ON CONFLICT (wallet_address, role_name) DO NOTHING');
    expect(query.mock.calls[2][1]).toEqual([wallet, 'admin']);
    expect(log).toHaveBeenCalledWith('Admin seeded successfully');
  });

  it('logs when the configured admin user already exists', async () => {
    const { service } = setup();
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation();

    await service.onApplicationBootstrap();

    expect(log).toHaveBeenCalledWith('Admin already exists');
  });

  it('skips seeding when disabled', async () => {
    const { service, transaction } = setup({ env: { DISABLE_SEED: 'true' } });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(transaction).not.toHaveBeenCalled();
  });

  it('fails startup when the admin wallet is not configured', async () => {
    const { service, transaction } = setup({ env: {} });

    await expect(service.onApplicationBootstrap()).rejects.toThrow('DEFAULT_ADMIN_WALLET');

    expect(transaction).not.toHaveBeenCalled();
  });
});
