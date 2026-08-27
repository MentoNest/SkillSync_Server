import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1173: Indexes supporting GET /users search performance:
 * - users.displayName for case-insensitive partial name search
 * - user_roles.roleId for role-based filtering
 */
export class AddUserSearchIndexes1725000000005 implements MigrationInterface {
  name = 'AddUserSearchIndexes1725000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_displayName" ON "users" ("displayName")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_roles_roleId" ON "user_roles" ("roleId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_roleId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_displayName"`);
  }
}
