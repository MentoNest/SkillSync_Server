import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../modules/auth/entities/role.entity';
import { User, UserStatus } from '../../modules/auth/entities/user.entity';
import { normalizeWalletAddress } from '../../common/utils/wallet.utils';

export interface SeedResult {
  roleCreated: boolean;
  roleAlreadyExists: boolean;
  userCreated: boolean;
  userAlreadyExists: boolean;
  message: string;
}

@Injectable()
export class AdminSeedService {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Run the admin seed logic with full transaction support
   */
  async seed(): Promise<SeedResult> {
    // Check if seeding is disabled
    const disableSeed = this.configService.get<string>('DISABLE_SEED');
    if (disableSeed === 'true') {
      this.logger.log('Seeding is disabled via DISABLE_SEED=true');
      return {
        roleCreated: false,
        roleAlreadyExists: true,
        userCreated: false,
        userAlreadyExists: true,
        message: 'Seeding disabled',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Seed admin role
      const roleResult = await this.seedAdminRole(queryRunner);

      // Step 2: Seed admin user
      const userResult = await this.seedAdminUser(queryRunner, roleResult);

      // Commit transaction
      await queryRunner.commitTransaction();

      const message = this.buildResultMessage(roleResult, userResult);
      this.logger.log(`Admin seeding completed: ${message}`);

      return {
        roleCreated: roleResult.created,
        roleAlreadyExists: roleResult.alreadyExists,
        userCreated: userResult.created,
        userAlreadyExists: userResult.alreadyExists,
        message,
      };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(`Admin seeding failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      // Release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Seed the admin role (idempotent)
   */
  private async seedAdminRole(
    queryRunner: QueryRunner,
  ): Promise<{ created: boolean; alreadyExists: boolean; role: Role }> {
    const adminRoleName = 'admin';

    const existingRoles = await queryRunner.query(
      `SELECT * FROM roles WHERE name = $1`,
      [adminRoleName],
    );

    if (existingRoles && existingRoles.length > 0) {
      this.logger.log(`Admin role already exists`);
      return {
        created: false,
        alreadyExists: true,
        role: existingRoles[0] as Role,
      };
    }

    const savedRoleResult = await queryRunner.query(
      `INSERT INTO roles (name, description)
       VALUES ($1, $2)
       ON CONFLICT (name)
       DO UPDATE SET description = EXCLUDED.description
       RETURNING *`,
      [adminRoleName, 'Administrator role with full system permissions'],
    );

    const savedRole = Array.isArray(savedRoleResult)
      ? savedRoleResult[0]
      : savedRoleResult;

    if (!savedRole) {
      throw new Error('Failed to create or retrieve admin role');
    }

    this.logger.log(`Created or updated admin role with ID: ${savedRole.id}`);

    return {
      created: true,
      alreadyExists: false,
      role: savedRole as Role,
    };
  }

  /**
   * Seed the default admin user (idempotent)
   */
  private async seedAdminUser(
    queryRunner: QueryRunner,
    roleResult: { created: boolean; alreadyExists: boolean; role: Role },
  ): Promise<{ created: boolean; alreadyExists: boolean; user?: User }> {
    const adminWallet = this.configService.get<string>('DEFAULT_ADMIN_WALLET');

    if (!adminWallet) {
      this.logger.warn(
        'DEFAULT_ADMIN_WALLET environment variable not set. Skipping admin user creation.',
      );
      return {
        created: false,
        alreadyExists: false,
        user: undefined,
      };
    }

    const normalizedWallet = normalizeWalletAddress(adminWallet);

    const existingUser = await queryRunner.query(
      `SELECT u.* FROM users u WHERE u."walletAddress" = $1`,
      [normalizedWallet],
    );

    if (existingUser && existingUser.length > 0) {
      this.logger.log(`Admin user already exists for wallet: ${normalizedWallet}`);
      await this.ensureUserHasAdminRole(
        queryRunner,
        existingUser[0].id,
        roleResult.role.id,
      );

      return {
        created: false,
        alreadyExists: true,
        user: existingUser[0] as User,
      };
    }

    const adminUser = this.userRepository.create({
      walletAddress: normalizedWallet,
      nonce: null,
      tokenVersion: 1,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await queryRunner.manager.save(adminUser);
    this.logger.log(`Created new admin user with ID: ${savedUser.id}`);

    await queryRunner.query(
      `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [savedUser.id, roleResult.role.id],
    );

    return {
      created: true,
      alreadyExists: false,
      user: savedUser,
    };
  }

  /**
   * Ensure the user has the admin role assigned
   */
  private async ensureUserHasAdminRole(
    queryRunner: QueryRunner,
    userId: string,
    roleId: string,
  ): Promise<void> {
    const userRole = await queryRunner.query(
      `SELECT 1 FROM user_roles WHERE "userId" = $1 AND "roleId" = $2`,
      [userId, roleId],
    );

    if (!userRole || userRole.length === 0) {
      await queryRunner.query(
        `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, roleId],
      );
      this.logger.log(`Assigned admin role to user: ${userId}`);
    }
  }

  /**
   * Build result message based on seed results
   */
  private buildResultMessage(roleResult: any, userResult: any): string {
    if (roleResult.alreadyExists && userResult.user && userResult.alreadyExists) {
      return 'Admin already exists';
    }

    const parts: string[] = [];

    if (roleResult.created) {
      parts.push('Admin role created');
    } else if (roleResult.alreadyExists) {
      parts.push('Admin role already exists');
    }

    if (userResult.user === undefined) {
      parts.push('No default admin wallet configured');
    } else if (userResult.created) {
      parts.push('Admin user created');
    } else if (userResult.alreadyExists) {
      parts.push('Admin user already exists');
    }

    if (parts.every((part) => part.endsWith('already exists'))) {
      return 'Admin already exists';
    }

    return `Admin seeded successfully: ${parts.join('; ')}`;
  }
}
