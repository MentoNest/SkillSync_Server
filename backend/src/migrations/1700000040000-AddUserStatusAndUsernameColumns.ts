import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1456 / #1457: normalise the user status ENUM to include
 * `pending_verification` and add the username / display-name profile columns.
 */
export class AddUserStatusAndUsernameColumns1700000040000 implements MigrationInterface {
  name = 'AddUserStatusAndUsernameColumns1700000040000';

  public async up(q: QueryRunner): Promise<void> {
    // Rebuild the status enum so it carries the `pending_verification` value.
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE character varying(32) USING "status"::text`);
    await q.query(`UPDATE "users" SET "status" = 'pending_verification' WHERE "status" = 'pending'`);
    await q.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await q.query(`CREATE TYPE "users_status_enum" AS ENUM ('active','pending_verification','suspended','deleted')`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE "users_status_enum" USING "status"::"users_status_enum"`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'`);

    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" character varying(30)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "displayName" character varying(50)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" character varying(2048)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "usernameChangedAt" TIMESTAMP WITH TIME ZONE`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_username" ON "users" ("username") WHERE "username" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_users_username"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "username"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "usernameChangedAt"`);

    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE character varying(32) USING "status"::text`);
    await q.query(`UPDATE "users" SET "status" = 'pending' WHERE "status" = 'pending_verification'`);
    await q.query(`UPDATE "users" SET "status" = 'active' WHERE "status" NOT IN ('active','pending','suspended','deleted')`);
    await q.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await q.query(`CREATE TYPE "users_status_enum" AS ENUM ('active','pending','suspended','deleted')`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE "users_status_enum" USING "status"::"users_status_enum"`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'`);
  }
}
