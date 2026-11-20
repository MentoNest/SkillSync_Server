import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds username and display_name columns to the users table.
 *
 * username:
 *   - VARCHAR(30), nullable — existing rows get NULL until the user sets one.
 *   - Partial unique index (WHERE username IS NOT NULL) so NULLs don't conflict.
 *
 * display_name:
 *   - VARCHAR(50), nullable — no uniqueness requirement.
 *
 * username_changed_at:
 *   - TIMESTAMPTZ, nullable — tracks last change for the 30-day cooldown.
 */
export class AddUsernameAndDisplayName1795171000000 implements MigrationInterface {
  name = 'AddUsernameAndDisplayName1795171000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS username VARCHAR(30) NULL,
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ NULL
    `);

    // Partial unique index: only non-NULL usernames must be distinct.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username
        ON users (username)
        WHERE username IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_users_username`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS username_changed_at,
        DROP COLUMN IF EXISTS display_name,
        DROP COLUMN IF EXISTS username
    `);
  }
}
