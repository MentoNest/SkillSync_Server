import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendMenteeProfile1795210200000 implements MigrationInterface {
  name = 'ExtendMenteeProfile1795210200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE skill_level_enum AS ENUM ('beginner', 'intermediate', 'advanced');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT con.conname INTO constraint_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE rel.relname = 'mentee_profiles'
           AND con.contype = 'c'
           AND pg_get_constraintdef(con.oid) LIKE '%experience_level%';
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE mentee_profiles DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE mentee_profiles
        ALTER COLUMN learning_goals TYPE TEXT[]
          USING CASE
            WHEN learning_goals IS NULL OR btrim(learning_goals) = '' THEN '{}'::text[]
            ELSE ARRAY[learning_goals]
          END,
        ALTER COLUMN learning_goals SET DEFAULT '{}'::text[],
        ALTER COLUMN experience_level TYPE skill_level_enum
          USING experience_level::skill_level_enum,
        ADD COLUMN IF NOT EXISTS preferred_mentoring_style TEXT[] NOT NULL DEFAULT '{}'::text[],
        ADD COLUMN IF NOT EXISTS time_commitment_hours_per_week INT NULL,
        ADD COLUMN IF NOT EXISTS professional_background TEXT NULL,
        ADD COLUMN IF NOT EXISTS job_title VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS industry VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS portfolio_links JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mentee_profiles
        DROP COLUMN IF EXISTS portfolio_links,
        DROP COLUMN IF EXISTS industry,
        DROP COLUMN IF EXISTS job_title,
        DROP COLUMN IF EXISTS professional_background,
        DROP COLUMN IF EXISTS time_commitment_hours_per_week,
        DROP COLUMN IF EXISTS preferred_mentoring_style,
        ALTER COLUMN experience_level TYPE VARCHAR(16) USING experience_level::text,
        ALTER COLUMN learning_goals DROP DEFAULT,
        ALTER COLUMN learning_goals TYPE VARCHAR(500)
          USING COALESCE(learning_goals[1], '')
    `);

    await queryRunner.query(`
      ALTER TABLE mentee_profiles
        ADD CONSTRAINT chk_mentee_experience_level
        CHECK (experience_level IN ('beginner', 'intermediate', 'advanced'))
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS skill_level_enum`);
  }
}
