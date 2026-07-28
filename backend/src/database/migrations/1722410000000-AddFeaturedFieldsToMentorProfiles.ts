import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1005: Adds featured-mentor fields to mentor_profiles, plus the
 * composite index used by the public "featured mentors" listing.
 */
export class AddFeaturedFieldsToMentorProfiles1722410000000 implements MigrationInterface {
  name = 'AddFeaturedFieldsToMentorProfiles1722410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mentor_profiles"
        ADD COLUMN "isFeatured" boolean NOT NULL DEFAULT false,
        ADD COLUMN "featuredAt" TIMESTAMP,
        ADD COLUMN "featuredExpiresAt" TIMESTAMP,
        ADD COLUMN "featuredOrder" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_isFeatured" ON "mentor_profiles" ("isFeatured")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_featuredOrder" ON "mentor_profiles" ("featuredOrder")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_isFeatured_featuredOrder"
        ON "mentor_profiles" ("isFeatured", "featuredOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_isFeatured_featuredOrder"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_featuredOrder"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_isFeatured"`,
    );
    await queryRunner.query(`
      ALTER TABLE "mentor_profiles"
        DROP COLUMN "featuredOrder",
        DROP COLUMN "featuredExpiresAt",
        DROP COLUMN "featuredAt",
        DROP COLUMN "isFeatured"
    `);
  }
}
