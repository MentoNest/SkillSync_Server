import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates mentor_profiles and mentee_profiles tables.
 *
 * Design notes:
 *  - FK to users(wallet_address) with ON DELETE CASCADE: removing a user
 *    removes their profiles. Profile history rows are intentionally NOT
 *    cascaded (they have no FK) so they remain for auditing.
 *  - One profile per wallet per type enforced by unique indexes on wallet_address.
 *  - Array fields (skills, interests, languages) stored as JSONB.
 *  - hourlyRateUsdCents / budgetUsdCentsPerMonth nullable (NULL = no preference).
 *  - 'mentee' role row seeded alongside 'mentor' already seeded by admin-seed.
 */
export class CreateProfileTables1795173000000 implements MigrationInterface {
  name = 'CreateProfileTables1795173000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── mentor_profiles ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE mentor_profiles (
        id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address        VARCHAR(56)   NOT NULL
                                REFERENCES users(wallet_address) ON DELETE CASCADE,
        bio                   VARCHAR(500)  NOT NULL,
        skills                JSONB         NOT NULL DEFAULT '[]'::jsonb,
        hourly_rate_usd_cents INT           NULL,
        max_mentees           SMALLINT      NOT NULL DEFAULT 3,
        languages             JSONB         NOT NULL DEFAULT '["English"]'::jsonb,
        is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_mentor_wallet
        ON mentor_profiles (wallet_address)
    `);

    // ── mentee_profiles ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE mentee_profiles (
        id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address              VARCHAR(56)   NOT NULL
                                      REFERENCES users(wallet_address) ON DELETE CASCADE,
        learning_goals              VARCHAR(500)  NOT NULL,
        interests                   JSONB         NOT NULL DEFAULT '[]'::jsonb,
        budget_usd_cents_per_month  INT           NULL,
        experience_level            VARCHAR(16)   NOT NULL
                                      CHECK (experience_level IN ('beginner','intermediate','advanced')),
        languages                   JSONB         NOT NULL DEFAULT '["English"]'::jsonb,
        is_active                   BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at                  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at                  TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_mentee_wallet
        ON mentee_profiles (wallet_address)
    `);

    // Seed the 'mentee' role row so user_roles FK is satisfied.
    await queryRunner.query(`
      INSERT INTO roles (name, permissions)
      VALUES ('mentee', '[]'::jsonb)
      ON CONFLICT (name) DO NOTHING
    `);

    // Seed the 'mentor' role row in case the admin-seed hasn't run yet.
    await queryRunner.query(`
      INSERT INTO roles (name, permissions)
      VALUES ('mentor', '[]'::jsonb)
      ON CONFLICT (name) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mentee_wallet`);
    await queryRunner.query(`DROP TABLE IF EXISTS mentee_profiles`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mentor_wallet`);
    await queryRunner.query(`DROP TABLE IF EXISTS mentor_profiles`);
  }
}
