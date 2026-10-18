import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #1477: notifications and per-user type preferences. */
export class CreateNotifications1700000071000 implements MigrationInterface {
  name = 'CreateNotifications1700000071000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      CREATE TYPE "notifications_type_enum" AS ENUM
        ('session_reminder','message','profile_verification','suspension_warning','announcement');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "notifications_type_enum" NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_user_unread" ON "notifications" ("user_id", "is_read")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "notifications_type_enum" NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_notification_preferences_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_user_type" UNIQUE ("user_id", "type"),
        CONSTRAINT "FK_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "notification_preferences"`);
    await q.query(`DROP TABLE IF EXISTS "notifications"`);
    await q.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
  }
}
