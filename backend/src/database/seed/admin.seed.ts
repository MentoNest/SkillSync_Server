import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { User } from '../../entities/user.entity';

const ADMIN_ROLE = 'admin';
const ADMIN_PERMISSIONS = [
  'user:read',
  'user:write',
  'user:delete',
  'role:read',
  'role:write',
  'role:delete',
  'audit:read',
  '*',
];

const logger = new Logger('AdminSeed');

/**
 * Seeds the default admin user if it does not already exist.
 * Uses a database transaction to ensure atomicity.
 * Idempotent — safe to run on every application boot.
 *
 * Controlled by env vars:
 *   DEFAULT_ADMIN_WALLET  — wallet address for the default admin
 *   DISABLE_SEED=true     — skip seeding entirely
 */
export async function seedAdmin(dataSource: DataSource): Promise<void> {
  if (process.env.DISABLE_SEED === 'true') {
    logger.log('Seeding disabled via DISABLE_SEED=true — skipping admin seed.');
    return;
  }

  const adminWallet = process.env.DEFAULT_ADMIN_WALLET;
  if (!adminWallet) {
    logger.warn('DEFAULT_ADMIN_WALLET is not set — skipping admin seed.');
    return;
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepository = queryRunner.manager.getRepository(User);

    // Check idempotently whether an admin user already exists
    const existingAdmin = await userRepository
      .createQueryBuilder('user')
      .where('user.wallet = :wallet', { wallet: adminWallet })
      .getOne();

    if (existingAdmin) {
      // Ensure the admin role and permissions are present (upgrade path)
      const hasAdminRole = existingAdmin.roles.includes(ADMIN_ROLE);
      const missingPermissions = ADMIN_PERMISSIONS.filter(
        (p) => !existingAdmin.permissions.includes(p),
      );

      if (hasAdminRole && missingPermissions.length === 0) {
        logger.log(
          JSON.stringify({
            event: 'admin_seed',
            status: 'skipped',
            message: 'Admin already exists',
            wallet: adminWallet,
            timestamp: new Date().toISOString(),
          }),
        );
        await queryRunner.rollbackTransaction(); // nothing to commit
        return;
      }

      // Patch missing roles / permissions in-place
      if (!hasAdminRole) {
        existingAdmin.roles = [...existingAdmin.roles, ADMIN_ROLE];
      }
      if (missingPermissions.length > 0) {
        existingAdmin.permissions = [
          ...existingAdmin.permissions,
          ...missingPermissions,
        ];
      }
      await userRepository.save(existingAdmin);

      logger.log(
        JSON.stringify({
          event: 'admin_seed',
          status: 'patched',
          message: 'Existing admin user patched with missing roles/permissions',
          wallet: adminWallet,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      // Insert new admin user
      const adminUser = userRepository.create({
        wallet: adminWallet,
        roles: [ADMIN_ROLE],
        permissions: ADMIN_PERMISSIONS,
      });
      await userRepository.save(adminUser);

      logger.log(
        JSON.stringify({
          event: 'admin_seed',
          status: 'created',
          message: 'Admin seeded successfully',
          wallet: adminWallet,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    logger.error(
      JSON.stringify({
        event: 'admin_seed',
        status: 'error',
        message: 'Admin seed failed — transaction rolled back',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
    throw error;
  } finally {
    await queryRunner.release();
  }
}
