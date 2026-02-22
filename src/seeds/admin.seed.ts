import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../modules/user/providers/user.service';
import { ConfigService } from '../config/config.service';
import { UserRole } from '../common/enums/user-role.enum';

async function run() {
  const logger = new Logger('seed:admin');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const config = app.get(ConfigService);
    const userService = app.get(UserService);

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@skillsync.local';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
    const ADMIN_WALLET = process.env.ADMIN_WALLET ?? '';
    const ADMIN_FIRST = process.env.ADMIN_FIRST_NAME ?? 'Platform';
    const ADMIN_LAST = process.env.ADMIN_LAST_NAME ?? 'Admin';

    logger.log('Starting admin seed (idempotent)');

    // Try by email first (if email provided)
    let user = ADMIN_EMAIL ? await userService.findByEmail(ADMIN_EMAIL) : null;

    // If not found by email and wallet specified, try by public key
    if (!user && ADMIN_WALLET) {
      user = await userService.findByPublicKey(ADMIN_WALLET);
    }

    if (user) {
      let changed = false;
      // Ensure role is ADMIN
      if (user.role !== UserRole.ADMIN) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        user.role = UserRole.ADMIN;
        changed = true;
      }

      // Ensure primary wallet exists when ADMIN_WALLET provided
      if (ADMIN_WALLET && !user.wallets.some(w => w.address === ADMIN_WALLET)) {
        // Create a proper Wallet entity through the userService
        await userService.linkWallet(user.id, ADMIN_WALLET);
        changed = true;
      } else if (ADMIN_WALLET) {
        // Make provided wallet primary
        user.wallets.forEach(w => (w.isPrimary = w.address === ADMIN_WALLET));
      }

      if (changed) {
        user.updatedAt = new Date();
        logger.log(`Updated existing user to ADMIN: ${user.email ?? user.publicKey}`);
      } else {
        logger.log('Admin user already present and up-to-date');
      }

      // If password provided and user has email, ensure password is set (hashed)
      if (user.email && ADMIN_PASSWORD) {
        // Only replace if passwordHash is missing
        if (!user.passwordHash) {
          (user as any).passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
          logger.log('Set password for admin user');
        }
      }
    } else {
      // Create new admin user
      const hashedPassword = ADMIN_PASSWORD ? await bcrypt.hash(ADMIN_PASSWORD, 10) : undefined;

      const userData: Partial<any> = {
        firstName: ADMIN_FIRST,
        lastName: ADMIN_LAST,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isActive: true,
      };

      // If wallet provided, prefer wallet-based creation
      if (ADMIN_WALLET) {
        const created = await userService.findOrCreateByPublicKey(ADMIN_WALLET);
        // assign remaining fields
        created.firstName = ADMIN_FIRST;
        created.lastName = ADMIN_LAST;
        if (ADMIN_EMAIL) created.email = ADMIN_EMAIL;
        if (hashedPassword) (created as any).passwordHash = hashedPassword;
        created.role = UserRole.ADMIN;
        created.updatedAt = new Date();
        logger.log(`Created admin user (wallet): ${ADMIN_WALLET}`);
      } else {
        const created = await userService.create(userData);
        logger.log(`Created admin user (email): ${created.email}`);
      }
    }

    logger.log('Admin seed completed successfully');
    await app.close();
    process.exit(0);
  } catch (err) {
    logger.error('Admin seed failed', err as any);
    await app.close();
    process.exit(1);
  }
}

// Run when executed via ts-node
// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
