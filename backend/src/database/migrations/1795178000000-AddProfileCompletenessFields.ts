import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds optional profile fields used by the completeness score's bonus points. */
export class AddProfileCompletenessFields1795178000000 implements MigrationInterface {
  name = 'AddProfileCompletenessFields1795178000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS education JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        ADD COLUMN IF NOT EXISTS expertise_areas JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mentor_profiles DROP COLUMN IF EXISTS expertise_areas
    `);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS certifications,
        DROP COLUMN IF EXISTS education
    `);
  }
}
