import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #1476: mentorship sessions with a database-level double-booking guard. */
export class CreateSessions1700000070000 implements MigrationInterface {
  name = 'CreateSessions1700000070000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await q.query(`DO $$ BEGIN
      CREATE TYPE "sessions_status_enum" AS ENUM ('pending','confirmed','completed','cancelled','no_show');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_id" uuid NOT NULL,
        "mentee_id" uuid NOT NULL,
        "start_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "sessions_status_enum" NOT NULL DEFAULT 'pending',
        "meeting_url" character varying(2048),
        "notes" text,
        "rating" smallint,
        "review" text,
        "cancelled_by" uuid,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "cancellation_reason" character varying(500),
        "reminder_sent_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_sessions_window" CHECK ("end_time" > "start_time"),
        CONSTRAINT "CHK_sessions_rating" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5)),
        CONSTRAINT "FK_sessions_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sessions_mentee" FOREIGN KEY ("mentee_id") REFERENCES "users"("id") ON DELETE CASCADE,
        -- A mentor can never hold two overlapping pending/confirmed sessions.
        CONSTRAINT "EXCL_sessions_mentor_overlap" EXCLUDE USING gist (
          "mentor_id" WITH =,
          tstzrange("start_time", "end_time") WITH &&
        ) WHERE ("status" IN ('pending','confirmed'))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_sessions_mentor_start" ON "sessions" ("mentor_id", "start_time")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_sessions_mentee_start" ON "sessions" ("mentee_id", "start_time")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sessions"`);
    await q.query(`DROP TYPE IF EXISTS "sessions_status_enum"`);
  }
}
