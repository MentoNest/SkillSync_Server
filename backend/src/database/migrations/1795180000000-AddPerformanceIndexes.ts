import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Query-pattern driven indexes (#1695).
 *
 * All statements are idempotent so the migration can be replayed after a
 * partially applied deploy. The two new columns back the requested mentor
 * discovery index (`isVerified`, `averageRating`) and the user filtering
 * index (`role`, `status`, `createdAt`).
 */
export class AddPerformanceIndexes1795180000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1795180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Columns required by the composite indexes.
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role VARCHAR(32) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS average_rating NUMERIC(2, 1) NOT NULL DEFAULT 0
    `);

    // Backfill the denormalised role from the existing many-to-many relation.
    await queryRunner.query(`
      UPDATE users u
         SET role = r.role_name
        FROM (
          SELECT ur.wallet_address, MIN(ur.role_name) AS role_name
            FROM user_roles ur
           GROUP BY ur.wallet_address
        ) r
       WHERE u.wallet_address = r.wallet_address
         AND u.role IS NULL
    `);

    // User: auth and admin list queries.
    await this.createIndex(
      queryRunner,
      'idx_users_wallet_status',
      'users',
      'wallet_address, status',
    );
    await this.createIndex(
      queryRunner,
      'idx_users_role_status_created',
      'users',
      'role, status, created_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_users_status_role_created',
      'users',
      'status, role, created_at',
    );

    // Mentor/mentee discovery.
    await this.createIndex(
      queryRunner,
      'idx_mentor_verified_rating',
      'mentor_profiles',
      'is_verified, average_rating',
    );
    await this.createIndex(
      queryRunner,
      'idx_mentor_discovery',
      'mentor_profiles',
      'is_active, is_verified, average_rating',
    );
    await this.createIndex(
      queryRunner,
      'idx_mentor_created_at',
      'mentor_profiles',
      'created_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_mentee_wallet_active',
      'mentee_profiles',
      'wallet_address, is_active',
    );
    await this.createIndex(
      queryRunner,
      'idx_mentee_active_experience',
      'mentee_profiles',
      'is_active, experience_level',
    );
    await this.createIndex(
      queryRunner,
      'idx_mentee_created_at',
      'mentee_profiles',
      'created_at',
    );

    // Availability lookups (mentor + day + time and exception overlap checks).
    await this.createIndex(
      queryRunner,
      'idx_availability_slots_mentor_day_time',
      'availability_slots',
      'mentor_id, day_of_week, start_time_utc',
    );
    await this.createIndex(
      queryRunner,
      'idx_availability_slots_mentor_created',
      'availability_slots',
      'mentor_id, created_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_availability_exceptions_mentor_date_unavailable',
      'availability_exceptions',
      'mentor_id, date, is_unavailable',
    );

    // Profile history audit queries and portfolio link listings.
    await this.createIndex(
      queryRunner,
      'idx_ph_user_type_changed',
      'profile_history',
      'user_id, profile_type, changed_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_ph_reason_changed',
      'profile_history',
      'change_reason, changed_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_portfolio_links_wallet_created',
      'portfolio_links',
      'wallet_address, created_at',
    );
    await this.createIndex(
      queryRunner,
      'idx_portfolio_links_platform',
      'portfolio_links',
      'platform',
    );

    // Foreign-key columns of the role join table (all FK columns are indexed).
    await this.createIndex(
      queryRunner,
      'idx_user_roles_wallet',
      'user_roles',
      'wallet_address',
    );
    await this.createIndex(
      queryRunner,
      'idx_user_roles_role',
      'user_roles',
      'role_name',
    );
    await this.createIndex(
      queryRunner,
      'idx_user_roles_role_wallet',
      'user_roles',
      'role_name, wallet_address',
    );

    await queryRunner.query('ANALYZE users');
    await queryRunner.query('ANALYZE mentor_profiles');
    await queryRunner.query('ANALYZE availability_slots');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'idx_user_roles_role_wallet',
      'idx_user_roles_role',
      'idx_user_roles_wallet',
      'idx_portfolio_links_platform',
      'idx_portfolio_links_wallet_created',
      'idx_ph_reason_changed',
      'idx_ph_user_type_changed',
      'idx_availability_exceptions_mentor_date_unavailable',
      'idx_availability_slots_mentor_created',
      'idx_availability_slots_mentor_day_time',
      'idx_mentee_created_at',
      'idx_mentee_active_experience',
      'idx_mentee_wallet_active',
      'idx_mentor_created_at',
      'idx_mentor_discovery',
      'idx_mentor_verified_rating',
      'idx_users_status_role_created',
      'idx_users_role_status_created',
      'idx_users_wallet_status',
    ];
    for (const index of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
    }

    await queryRunner.query(
      `ALTER TABLE mentor_profiles DROP COLUMN IF EXISTS average_rating, DROP COLUMN IF EXISTS is_verified`,
    );
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS role`);
  }

  private async createIndex(
    queryRunner: QueryRunner,
    name: string,
    table: string,
    columns: string,
  ): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${columns})`,
    );
  }
}
