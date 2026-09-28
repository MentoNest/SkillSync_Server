import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1174: Adds the `deletedAt` soft-delete timestamp to `users` (idempotent -
 * the original CreateUserTable migration already added this column on some
 * environments) plus a supporting index for the grace-period sweep query.
 */
export class AddUserSoftDelete1725000000007 implements MigrationInterface {
  name = 'AddUserSoftDelete1725000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'deletedAt');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP NULL`);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_deletedAt" ON "users" ("deletedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_deletedAt"`);
    const hasColumn = await queryRunner.hasColumn('users', 'deletedAt');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
    }
  }
}
