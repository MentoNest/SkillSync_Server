import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMenteeCapacityToServiceListings1800000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "maxMentees" integer,
      ADD COLUMN IF NOT EXISTS "currentMenteeCount" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "maxMentees",
      DROP COLUMN IF EXISTS "currentMenteeCount"
    `);
  }
}
