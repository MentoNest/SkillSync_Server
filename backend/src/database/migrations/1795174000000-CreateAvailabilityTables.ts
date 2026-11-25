import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAvailabilityTables1795174000000 implements MigrationInterface {
  name = 'CreateAvailabilityTables1795174000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE availability_slots (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        mentor_id       VARCHAR(56)   NOT NULL
                          REFERENCES mentor_profiles(wallet_address) ON DELETE CASCADE,
        day_of_week     SMALLINT      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time_utc  TIME          NOT NULL,
        end_time_utc    TIME          NOT NULL,
        timezone        VARCHAR(64)   NOT NULL DEFAULT 'UTC',
        created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CHECK (end_time_utc > start_time_utc)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_availability_slots_mentor
        ON availability_slots (mentor_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_availability_slots_mentor_day
        ON availability_slots (mentor_id, day_of_week)
    `);

    await queryRunner.query(`
      CREATE TABLE availability_exceptions (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        mentor_id       VARCHAR(56)   NOT NULL
                          REFERENCES mentor_profiles(wallet_address) ON DELETE CASCADE,
        date            DATE          NOT NULL,
        start_time_utc  TIME          NOT NULL,
        end_time_utc    TIME          NOT NULL,
        reason          VARCHAR(255)  NULL,
        is_unavailable  BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CHECK (end_time_utc > start_time_utc)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_availability_exceptions_mentor
        ON availability_exceptions (mentor_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_availability_exceptions_mentor_date
        ON availability_exceptions (mentor_id, date)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_availability_exceptions_mentor_date`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_availability_exceptions_mentor`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS availability_exceptions`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_availability_slots_mentor_day`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_availability_slots_mentor`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS availability_slots`);
  }
}
