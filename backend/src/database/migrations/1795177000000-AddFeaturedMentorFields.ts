import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the featured-mentor flag, timestamp and manual ordering column. */
export class AddFeaturedMentorFields1795177000000 implements MigrationInterface {
  name = 'AddFeaturedMentorFields1795177000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ(3) NULL,
        ADD COLUMN IF NOT EXISTS featured_order INT NULL
    `);

    // Composite index supports "active featured mentors ordered by featured_order".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mentor_featured_order
        ON mentor_profiles (is_featured, featured_order)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mentor_featured_order`);
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        DROP COLUMN IF EXISTS featured_order,
        DROP COLUMN IF EXISTS featured_at,
        DROP COLUMN IF EXISTS is_featured
    `);
  }
}
