import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToServiceListings2300000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_listings_deleted_at" 
      ON "service_listings" ("deletedAt")
      WHERE "isDeleted" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_service_listings_deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "deletedAt"
    `);
  }
}
