import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDraftModeToServiceListings1900000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "isDraft" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "isDraft"
    `);
  }
}
