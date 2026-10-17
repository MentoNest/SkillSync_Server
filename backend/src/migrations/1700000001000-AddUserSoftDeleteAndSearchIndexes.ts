import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the soft-delete/search indexes used by issues #1453 and #1454. */
export class AddUserSoftDeleteAndSearchIndexes1700000001000 implements MigrationInterface {
  name = 'AddUserSoftDeleteAndSearchIndexes1700000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_users_deleted_at" ON "users" ("deletedAt")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_users_display_name" ON "users" ("displayName")`);

    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_mentor_profiles_deleted_at" ON "mentor_profiles" ("deleted_at")`);

    // role lives in the user_roles join table, which may be created by the RBAC PR.
    await q.query(`
      DO $$
      BEGIN
        IF to_regclass('public.user_roles') IS NOT NULL THEN
          CREATE INDEX IF NOT EXISTS "IDX_user_roles_role_id" ON "user_roles" ("role_id");
        END IF;
      END $$`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_user_roles_role_id"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_mentor_profiles_deleted_at"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "deleted_at"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_display_name"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_deleted_at"`);
  }
}
