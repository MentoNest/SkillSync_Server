import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionsTable1750200000000 implements MigrationInterface {
  name = 'CreateSessionsTable1750200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "mentor_id"   UUID        NOT NULL,
        "mentee_id"   UUID        NOT NULL,
        "start_time"  TIMESTAMPTZ NOT NULL,
        "end_time"    TIMESTAMPTZ NOT NULL,
        "status"      VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
        "meeting_url" VARCHAR(512),
        "notes"       TEXT,
        "rating"      SMALLINT    CHECK (rating BETWEEN 1 AND 5),
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_mentor_time" ON "sessions" ("mentor_id", "start_time")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_mentee_time" ON "sessions" ("mentee_id", "start_time")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
  }
}
