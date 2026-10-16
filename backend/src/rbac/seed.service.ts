import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from './entities/role.entity';
import { DEFAULT_ROLE_PERMISSIONS, RoleName } from './roles';

/**
 * Idempotent bootstrap: ensures the default roles exist and, if ADMIN_WALLET_ADDRESS
 * is set, that this wallet exists and holds the admin role. Safe to run on every start.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const name of Object.values(RoleName)) {
      const existing = await this.roles.findOne({ where: { name } });
      if (!existing) {
        await this.roles.save(this.roles.create({ name, permissions: DEFAULT_ROLE_PERMISSIONS[name] }));
        this.logger.log(`Seeded role ${name}`);
      }
    }

    const wallet = this.config.get<string>('ADMIN_WALLET_ADDRESS')?.trim().toUpperCase();
    if (!wallet) {
      this.logger.warn('ADMIN_WALLET_ADDRESS not set; skipping admin user seed');
      return;
    }
    const admin = await this.roles.findOneOrFail({ where: { name: RoleName.ADMIN } });
    let user = await this.users.findOne({ where: { walletAddress: wallet }, relations: { roles: true } });
    if (!user) {
      user = this.users.create({ walletAddress: wallet, roles: [] });
    }
    if (!user.roles.some((r) => r.id === admin.id)) {
      user.roles.push(admin);
      await this.users.save(user);
      this.logger.log('Seeded admin user');
    }
  }
}
