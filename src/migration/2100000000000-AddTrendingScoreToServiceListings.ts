import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrendingScoreToServiceListings2100000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add trending_score column to service_listings table
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "trendingScore" decimal(10, 4) DEFAULT 0
    `);

    // Create index on trendingScore for efficient sorting
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_listings_trending_score"
      ON "service_listings" ("trendingScore" DESC, "isDeleted" ASC, "approvalStatus" ASC)
      WHERE "isDeleted" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_service_listings_trending_score"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "trendingScore"
    `);
  }
}
