import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1176: Adds the `status` lifecycle column (PostgreSQL ENUM) to `users`.
 *
 * Written defensively because an earlier migration (1725000000001) already
 * created a differently-shaped `users_status_enum` type/column on some
 * environments while the entity itself had drifted away from it. This
 * migration reconciles both cases:
 *  - Fresh database: creates the enum type and column from scratch.
 *  - Database that already has a `users.status` column: ensures the enum
 *    type carries the `pending_verification` value used by the current
 *    entity and resets the column default to `'active'`.
 */
export class AddUserStatusColumn1725000000006 implements MigrationInterface {
  name = 'AddUserStatusColumn1725000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'status');

    const typeExistsResult: Array<{ exists: boolean }> = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_status_enum') as "exists"`,
    );
    const typeExists = Boolean(typeExistsResult?.[0]?.exists);

    if (!typeExists) {
      await queryRunner.query(
        `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'pending_verification', 'suspended', 'deleted')`,
      );
    } else {
      // Type already exists (e.g. from migration 1725000000001 with a
      // different value set) - make sure the value this entity relies on
      // is present. Adding an existing value is a no-op.
      await queryRunner.query(
        `ALTER TYPE "public"."users_status_enum" ADD VALUE IF NOT EXISTS 'pending_verification'`,
      );
    }

    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`,
      );
    } else {
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'`);
    }

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_status" ON "users" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_status"`);
    const hasColumn = await queryRunner.hasColumn('users', 'status');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
    }
    // The enum type is intentionally left in place on down() since it may
    // still be referenced by migration 1725000000001 in environments where
    // both migrations have run.
  }
}
