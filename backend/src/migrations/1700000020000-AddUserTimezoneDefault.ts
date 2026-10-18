import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTimezoneDefault1700000020000 implements MigrationInterface {
  name = 'AddUserTimezoneDefault1700000020000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "users" SET "timezone" = 'UTC' WHERE "timezone" IS NULL`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'UTC'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ALTER COLUMN "timezone" DROP DEFAULT`);
  }
}
