import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds verification metadata and a pending-review marker to mentor profiles. */
export class AddMentorVerificationFields1795181000000 implements MigrationInterface {
  name = 'AddMentorVerificationFields1795181000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ(3) NULL,
        ADD COLUMN IF NOT EXISTS verified_by VARCHAR(56) NULL,
        ADD COLUMN IF NOT EXISTS verification_method VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS verification_notes TEXT NULL,
        ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ(3) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mentor_verification_requests
        ON mentor_profiles (verification_requested_at)
        WHERE is_verified = FALSE AND verification_requested_at IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_mentor_verification_requests`,
    );
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        DROP COLUMN IF EXISTS verification_requested_at,
        DROP COLUMN IF EXISTS verification_notes,
        DROP COLUMN IF EXISTS verification_method,
        DROP COLUMN IF EXISTS verified_by,
        DROP COLUMN IF EXISTS verified_at
    `);
  }
}
