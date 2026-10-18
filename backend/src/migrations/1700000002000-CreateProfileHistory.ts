import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Append-only audit trail of profile field changes (#1452).
 * Retention: entries are kept for at least 1 year; there is intentionally no
 * foreign key to "users" so history survives permanent account deletion.
 */
export class CreateProfileHistory1700000002000 implements MigrationInterface {
  name = 'CreateProfileHistory1700000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "profile_history_profile_type_enum" AS ENUM ('mentor','mentee')`);
    await q.query(`CREATE TYPE "profile_history_change_reason_enum" AS ENUM ('user_edit','admin_edit','system')`);
    await q.query(`
      CREATE TABLE "profile_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "profile_type" "profile_history_profile_type_enum" NOT NULL,
        "field_name" character varying(100) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "changed_by" character varying(64) NOT NULL DEFAULT 'system',
        "change_reason" "profile_history_change_reason_enum" NOT NULL DEFAULT 'system',
        "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_history_id" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE INDEX "IDX_profile_history_user_id" ON "profile_history" ("user_id")`);
    await q.query(`CREATE INDEX "IDX_profile_history_user_created" ON "profile_history" ("user_id","created_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "profile_history"`);
    await q.query(`DROP TYPE "profile_history_change_reason_enum"`);
    await q.query(`DROP TYPE "profile_history_profile_type_enum"`);
  }
}
