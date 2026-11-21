import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceUserEntity1795175000000 implements MigrationInterface {
  name = 'EnhanceUserEntity1795175000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_status_enum AS ENUM ('active', 'pending', 'suspended', 'deleted');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS status user_status_enum NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(2048) NULL,
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NULL DEFAULT 'UTC',
        ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NULL DEFAULT 'en',
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email
        ON users (email)
        WHERE email IS NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users (wallet_address)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_last_login_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_wallet_address`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_users_email`);

    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS deleted_at,
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS last_login_at,
        DROP COLUMN IF EXISTS locale,
        DROP COLUMN IF EXISTS timezone,
        DROP COLUMN IF EXISTS avatar_url,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS email
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS user_status_enum`);
  }
}
