import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #1478: content reports raised by users and handled by admins. */
export class CreateContentReports1700000072000 implements MigrationInterface {
  name = 'CreateContentReports1700000072000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      CREATE TYPE "content_reports_status_enum" AS ENUM ('open','resolved','dismissed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "content_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reporter_id" uuid NOT NULL,
        "target_type" character varying(50) NOT NULL,
        "target_id" character varying(100) NOT NULL,
        "reason" character varying(1000) NOT NULL,
        "status" "content_reports_status_enum" NOT NULL DEFAULT 'open',
        "resolved_by" uuid,
        "resolution_note" character varying(1000),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_content_reports_id" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_content_reports_status" ON "content_reports" ("status", "created_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "content_reports"`);
    await q.query(`DROP TYPE IF EXISTS "content_reports_status_enum"`);
  }
}
