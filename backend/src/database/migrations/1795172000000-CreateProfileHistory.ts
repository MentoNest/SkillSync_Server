import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the profile_history table.
 *
 * Design notes:
 *  - No foreign key to `users.wallet_address` intentionally: history rows must
 *    survive even if the user row is deleted, and they must remain readable even
 *    after entities are restructured.
 *  - `old_value` and `new_value` are JSONB so any scalar (string, number, boolean,
 *    null) is stored without casting.
 *  - `changed_at` and `retain_until` use TIMESTAMPTZ(3) for millisecond precision.
 *  - No UPDATE or DELETE privileges are granted; application code only INSERTs.
 *  - Two indexes:
 *      idx_ph_user_changed  — primary access pattern (admin API lookup by user)
 *      idx_ph_retain_until  — future retention job
 */
export class CreateProfileHistory1795172000000 implements MigrationInterface {
  name = 'CreateProfileHistory1795172000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE profile_history (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         VARCHAR(56)   NOT NULL,
        profile_type    VARCHAR(32)   NOT NULL,
        field_name      VARCHAR(64)   NOT NULL,
        old_value       JSONB         NULL,
        new_value       JSONB         NULL,
        changed_by      VARCHAR(56)   NOT NULL,
        change_reason   VARCHAR(16)   NOT NULL
                          CHECK (change_reason IN ('user_edit', 'admin_edit', 'system')),
        changed_at      TIMESTAMPTZ(3) NOT NULL,
        retain_until    TIMESTAMPTZ(3) NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ph_user_changed
        ON profile_history (user_id, changed_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ph_retain_until
        ON profile_history (retain_until)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ph_retain_until`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ph_user_changed`);
    await queryRunner.query(`DROP TABLE IF EXISTS profile_history`);
  }
}
