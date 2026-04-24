import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../modules/auth/entities/role.entity';
import { User } from '../../modules/auth/entities/user.entity';
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
    queryRunner: any,
  ): Promise<{ created: boolean; alreadyExists: boolean; role: Role }> {
    const adminRoleName = 'admin';

    // Check if admin role already exists using raw query for consistency
    const existingRole = await queryRunner.query(
      `SELECT * FROM roles WHERE name = $1`,
      [adminRoleName],
    );

    if (existingRole && existingRole.length > 0) {
      this.logger.log(`Admin role already exists`);
      const roleData = existingRole[0] as Role;
      return {
        created: false,
        alreadyExists: true,
        role: roleData,
      };
    }

    // Create admin role with full permissions description
    const adminRole = this.roleRepository.create({
      name: adminRoleName,
      description: 'Administrator role with full system permissions',
    });

    const savedRole = await queryRunner.manager.save(adminRole);
    this.logger.log(`Created new admin role with ID: ${savedRole.id}`);

    return {
      created: true,
      alreadyExists: false,
      role: savedRole,
    };
  }

  /**
   * Seed the default admin user (idempotent)
   */
  private async seedAdminUser(
    queryRunner: any,
    roleResult: { created: boolean; alreadyExists: boolean; role: Role },
  ): Promise<{ created: boolean; alreadyExists: boolean; user?: User }> {
    // Get admin wallet from environment
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

    // Check if admin user already exists
    const existingUser = await queryRunner.query(
      `SELECT u.* FROM users u WHERE u."walletAddress" = $1`,
      [normalizedWallet],
    );

    if (existingUser && existingUser.length > 0) {
      this.logger.log(`Admin user already exists for wallet: ${normalizedWallet}`);

      // Ensure the user has the admin role assigned
      await this.ensureUserHasAdminRole(
        queryRunner,
        existingUser[0].id,
        roleResult.role.id,
      );

      return {
        created: false,
        alreadyExists: true,
        user: existingUser[0],
      };
    }

    // Create admin user
    const adminUser = this.userRepository.create({
      walletAddress: normalizedWallet,
      nonce: null,
      tokenVersion: 1,
      roles: [roleResult.role],
    });

    const savedUser = await queryRunner.manager.save(adminUser);
    this.logger.log(`Created new admin user with ID: ${savedUser.id}`);

    // Assign admin role to the user
    await queryRunner.query(
      `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)`,
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
    queryRunner: any,
    userId: string,
    roleId: string,
  ): Promise<void> {
    // Check if user already has admin role
    const userRole = await queryRunner.query(
      `SELECT * FROM user_roles WHERE "userId" = $1 AND "roleId" = $2`,
      [userId, roleId],
    );

    if (!userRole || userRole.length === 0) {
      // Assign admin role
      await queryRunner.query(
        `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)`,
        [userId, roleId],
      );
      this.logger.log(`Assigned admin role to user: ${userId}`);
    }
  }

  /**
   * Build result message based on seed results
   */
  private buildResultMessage(roleResult: any, userResult: any): string {
    const rolePart = roleResult.alreadyExists
      ? 'Admin role already exists'
      : 'Admin role created';

    let userPart: string;
    if (userResult.user === undefined) {
      userPart = 'Admin user not created (no DEFAULT_ADMIN_WALLET)';
    } else {
      userPart = userResult.alreadyExists
        ? 'Admin user already exists'
        : 'Admin user created';
    }

    return `${rolePart}; ${userPart}`;
  }
}
