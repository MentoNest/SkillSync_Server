import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('DISABLE_SEED')?.trim().toLowerCase() === 'true') {
      this.logger.log('Admin seeding disabled');
      return;
    }

    const walletAddress = this.config.get<string>('DEFAULT_ADMIN_WALLET')?.trim();
    if (!walletAddress) {
      throw new Error('DEFAULT_ADMIN_WALLET must be set when admin seeding is enabled');
    }

    const adminCreated = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO roles (name, permissions)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (name) DO NOTHING`,
        ['admin', JSON.stringify(['*'])],
      );

      const insertedUsers = await manager.query(
        `INSERT INTO users (wallet_address)
         VALUES ($1)
         ON CONFLICT (wallet_address) DO NOTHING
         RETURNING wallet_address`,
        [walletAddress],
      );

      await manager.query(
        `INSERT INTO user_roles (wallet_address, role_name)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, role_name) DO NOTHING`,
        [walletAddress, 'admin'],
      );

      return insertedUsers.length > 0;
    });

    this.logger.log(adminCreated ? 'Admin seeded successfully' : 'Admin already exists');
  }
}
