import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns PostgreSQL `user_status_enum` with issue #1688 (`pending_verification`
 * instead of `pending`), keeping the migration idempotent on fresh or existing DBs.
 */
export class UpdateUserStatusEnum1795210000000 implements MigrationInterface {
  name = 'UpdateUserStatusEnum1795210000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'user_status_enum'
             AND e.enumlabel = 'pending'
        ) AND NOT EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'user_status_enum'
             AND e.enumlabel = 'pending_verification'
        ) THEN
          ALTER TYPE user_status_enum RENAME VALUE 'pending' TO 'pending_verification';
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'user_status_enum'
             AND e.enumlabel = 'pending_verification'
        ) AND NOT EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'user_status_enum'
             AND e.enumlabel = 'pending'
        ) THEN
          ALTER TYPE user_status_enum RENAME VALUE 'pending_verification' TO 'pending';
        END IF;
      END $$;
    `);
  }
}
