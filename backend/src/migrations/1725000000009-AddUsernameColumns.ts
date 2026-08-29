import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * #1177: Adds `username` (unique handle, nullable initially so existing
 * users are unaffected) and `usernameChangedAt` (cooldown tracking) to
 * `users`.
 */
export class AddUsernameColumns1725000000009 implements MigrationInterface {
  name = 'AddUsernameColumns1725000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'username'))) {
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30) NULL`);
    }
    if (!(await queryRunner.hasColumn('users', 'usernameChangedAt'))) {
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "usernameChangedAt" TIMESTAMP NULL`);
    }

    // Partial unique index: only enforce uniqueness once a user has set a
    // username, so the nullable rollout doesn't collide multiple NULLs
    // (Postgres treats NULLs as distinct in a unique index anyway, but the
    // WHERE clause keeps intent explicit and matches walletAddress/email).
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_username',
        columnNames: ['username'],
        isUnique: true,
        where: '"username" IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username"`);
    if (await queryRunner.hasColumn('users', 'usernameChangedAt')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "usernameChangedAt"`);
    }
    if (await queryRunner.hasColumn('users', 'username')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
    }
  }
}
