import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrencySupport1900000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "currency" varchar NOT NULL DEFAULT 'USD'
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD COLUMN IF NOT EXISTS "currency" varchar NOT NULL DEFAULT 'USD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "currency"
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP COLUMN IF EXISTS "currency"
    `);
  }
}
