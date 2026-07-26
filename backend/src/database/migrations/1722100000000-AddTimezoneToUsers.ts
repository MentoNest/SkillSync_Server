import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #996: Adds timezone column to users table (IANA string, default 'UTC').
 */
export class AddTimezoneToUsers1722100000000 implements MigrationInterface {
  name = 'AddTimezoneToUsers1722100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "timezone" varchar(64) NOT NULL DEFAULT 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "timezone"
    `);
  }
}
