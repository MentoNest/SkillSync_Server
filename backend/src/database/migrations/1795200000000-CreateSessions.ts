import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessions1795200000000 implements MigrationInterface {
  name = 'CreateSessions1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE sessions_status_enum
          AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        mentor_id             VARCHAR(56)   NOT NULL
                                REFERENCES users(wallet_address) ON DELETE CASCADE,
        mentee_id             VARCHAR(56)   NOT NULL
                                REFERENCES users(wallet_address) ON DELETE CASCADE,
        start_time            TIMESTAMPTZ(3) NOT NULL,
        end_time              TIMESTAMPTZ(3) NOT NULL,
        status                sessions_status_enum NOT NULL DEFAULT 'pending',
        meeting_url           VARCHAR(2048) NULL,
        notes                 TEXT          NULL,
        rating                SMALLINT      NULL,
        review                TEXT          NULL,
        cancellation_reason   VARCHAR(500)  NULL,
        reminder_sent_at      TIMESTAMPTZ(3) NULL,
        created_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CONSTRAINT chk_sessions_window CHECK (end_time > start_time),
        CONSTRAINT chk_sessions_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sessions ADD CONSTRAINT excl_sessions_mentor_overlap
          EXCLUDE USING gist (
            mentor_id WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
          ) WHERE (status IN ('pending', 'confirmed'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_mentor_start
        ON sessions (mentor_id, start_time)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_mentee_start
        ON sessions (mentee_id, start_time)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status_start
        ON sessions (status, start_time)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_mentor_status_start
        ON sessions (mentor_id, status, start_time)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_sessions_mentor_status_start`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_status_start`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_mentee_start`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_mentor_start`);
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
    await queryRunner.query(`DROP TYPE IF EXISTS sessions_status_enum`);
  }
}
