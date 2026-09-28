import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { User, ProfileType, UserStatus } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';
import { RoleName } from '../rbac/role-permissions';

export interface AdminSeedResult {
  /** True when the seed did not run at all (disabled or nothing to do). */
  skipped: boolean;
  skipReason?: string;
  /** Roles inserted by this run. */
  rolesCreated: string[];
  /** Wallet of the admin account, when one is configured. */
  adminWallet: string | null;
  adminUserId: string | null;
  /** True when the admin account was created, false when it already existed. */
  adminCreated: boolean;
  message: string;
}

/**
 * Predefined roles and their descriptions, mirrored by the admin seed.
 * `Role.defaultPermissionsFor` supplies the permission list.
 */
const DEFAULT_ROLES: ReadonlyArray<{ name: RoleName; description: string }> = [
  { name: RoleName.ADMIN, description: 'Full system access' },
  { name: RoleName.MENTOR, description: 'Can mentor users' },
  { name: RoleName.MENTEE, description: 'Can learn from mentors' },
];

/**
 * #1319: bootstrap seed.
 *
 * Guarantees the platform always boots into a usable state: the `admin` role
 * exists and at least one administrator account can authenticate.
 *
 * Properties:
 *  - runs on `OnApplicationBootstrap`, i.e. after the DataSource is connected
 *    and before the HTTP server starts accepting traffic;
 *  - fully idempotent: existence checks plus `ON CONFLICT DO NOTHING`, so it is
 *    safe on every boot and safe to re-run manually;
 *  - atomic: all writes happen inside a single transaction, so a failure leaves
 *    the database untouched;
 *  - opt-out via `DISABLE_SEED=true`.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  /**
   * Runs the seed. Safe to call directly (used by tests and by the
   * `seed:admin` npm script).
   */
  async seed(): Promise<AdminSeedResult> {
    if (this.isDisabled()) {
      this.logger.warn('Admin seed skipped: DISABLE_SEED=true');
      return {
        skipped: true,
        skipReason: 'DISABLE_SEED',
        rolesCreated: [],
        adminWallet: null,
        adminUserId: null,
        adminCreated: false,
        message: 'Admin seed skipped: DISABLE_SEED=true',
      };
    }

    const isTest = this.isTestEnvironment();
    const adminWallet = this.resolveAdminWallet(isTest);

    if (!adminWallet) {
      this.logger.warn(
        'Admin seed: no admin wallet configured. Set DEFAULT_ADMIN_WALLET (TEST_ADMIN_WALLET in the test environment) to create the bootstrap administrator.',
      );
    }

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const rolesCreated = await this.ensureRoles(manager);

        if (!adminWallet) {
          return {
            rolesCreated,
            adminWallet: null,
            adminUserId: null,
            adminCreated: false,
            message: `Roles ensured${rolesCreated.length ? ` (created: ${rolesCreated.join(', ')})` : ''}. Admin user skipped: no wallet configured.`,
          };
        }

        const { userId, created } = await this.ensureAdminUser(manager, adminWallet);

        return {
          rolesCreated,
          adminWallet,
          adminUserId: userId,
          adminCreated: created,
          message: created
            ? 'Admin seeded successfully'
            : 'Admin already exists',
        };
      });

      this.logger.log(
        `${result.message} (roles created: ${result.rolesCreated.length}, wallet: ${result.adminWallet ?? 'n/a'})`,
      );

      return { skipped: false, ...result };
    } catch (error) {
      // Never take the application down because seeding failed — log loudly so
      // the problem is visible and let the operator retry.
      this.logger.error(
        `Admin seed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        skipped: true,
        skipReason: 'ERROR',
        rolesCreated: [],
        adminWallet,
        adminUserId: null,
        adminCreated: false,
        message: `Admin seed failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private isDisabled(): boolean {
    return (process.env.DISABLE_SEED ?? '').toLowerCase() === 'true';
  }

  private isTestEnvironment(): boolean {
    return (process.env.NODE_ENV ?? '').toLowerCase() === 'test';
  }

  /**
   * #1319: the test environment must never touch production/dev seed data, so
   * it reads a dedicated `TEST_ADMIN_WALLET` and falls back to
   * `DEFAULT_ADMIN_WALLET` only when no test value is configured.
   */
  private resolveAdminWallet(isTest: boolean): string | null {
    const candidate = isTest
      ? (process.env.TEST_ADMIN_WALLET ?? process.env.DEFAULT_ADMIN_WALLET)
      : process.env.DEFAULT_ADMIN_WALLET;

    const wallet = candidate?.trim().toLowerCase();
    if (!wallet) {
      return null;
    }

    if (isTest) {
      this.logger.log('Admin seed: using the test environment seed profile');
    }

    return wallet;
  }

  /** Creates any missing predefined role. Returns the names that were inserted. */
  private async ensureRoles(manager: EntityManager): Promise<string[]> {
    const roleRepository = manager.getRepository(Role);
    const created: string[] = [];

    for (const role of DEFAULT_ROLES) {
      // Existence check first so the insert below can rely on ON CONFLICT for
      // the (unlikely) case of two instances booting at the same time.
      const existing = await roleRepository.findOne({ where: { name: role.name } });

      if (existing) {
        if (!existing.permissions?.length) {
          existing.permissions = Role.defaultPermissionsFor(role.name);
          existing.isSystem = true;
          await roleRepository.save(existing);
        }
        continue;
      }

      await manager
        .createQueryBuilder()
        .insert()
        .into(Role)
        .values({
          name: role.name,
          description: role.description,
          permissions: Role.defaultPermissionsFor(role.name),
          isSystem: true,
        })
        .orIgnore()
        .execute();

      created.push(role.name);
    }

    return created;
  }

  /**
   * Creates the bootstrap administrator when missing and guarantees the
   * `admin` role is attached to it. Idempotent on both steps.
   */
  private async ensureAdminUser(
    manager: EntityManager,
    walletAddress: string,
  ): Promise<{ userId: string; created: boolean }> {
    const userRepository = manager.getRepository(User);
    const roleRepository = manager.getRepository(Role);

    const existing = await userRepository.findOne({ where: { walletAddress } });

    let user = existing;
    let created = false;

    if (!user) {
      user = await userRepository.save(
        userRepository.create({
          walletAddress,
          displayName: 'SkillSync Admin',
          profileType: ProfileType.ADMIN,
          status: UserStatus.ACTIVE,
          isLocked: false,
          tokenVersion: 0,
          settings: { notifications: true, theme: 'light', emailAlerts: true },
        }),
      );
      created = true;
    }

    const adminRole = await roleRepository.findOne({ where: { name: RoleName.ADMIN } });

    if (!adminRole) {
      // Should be unreachable (ensureRoles runs first in the same transaction).
      throw new Error('Cannot assign the admin role: the role row is missing');
    }

    // The junction table has a composite primary key, so re-inserting the same
    // pair is a no-op thanks to ON CONFLICT DO NOTHING.
    await manager
      .createQueryBuilder()
      .insert()
      .into('user_roles')
      .values({ userId: user.id, roleId: adminRole.id })
      .orIgnore()
      .execute();

    return { userId: user.id, created };
  }
}
