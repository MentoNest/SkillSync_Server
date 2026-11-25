import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSuspensions1795210100000 implements MigrationInterface {
  name = 'CreateUserSuspensions1795210100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_suspensions (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address  VARCHAR(56)  NOT NULL
                          REFERENCES users(wallet_address) ON DELETE CASCADE,
        reason          TEXT         NOT NULL,
        suspended_by    VARCHAR(56)  NOT NULL,
        suspended_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        suspended_until TIMESTAMPTZ  NULL,
        is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
        lifted_at       TIMESTAMPTZ  NULL,
        lifted_by       VARCHAR(64)  NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_suspensions_wallet_active
        ON user_suspensions (wallet_address, is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_suspensions_active_until
        ON user_suspensions (is_active, suspended_until)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_suspensions_suspended_at
        ON user_suspensions (suspended_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_user_suspensions_suspended_at',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_user_suspensions_active_until',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_user_suspensions_wallet_active',
    );
    await queryRunner.query('DROP TABLE IF EXISTS user_suspensions');
  }
}
