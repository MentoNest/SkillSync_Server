import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #1455: record of user suspensions (temporary or permanent). */
export class CreateUserSuspensions1700000041000 implements MigrationInterface {
  name = 'CreateUserSuspensions1700000041000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_suspensions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "reason" character varying(500) NOT NULL,
        "suspended_by" uuid NOT NULL,
        "suspended_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "suspended_until" TIMESTAMP WITH TIME ZONE,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_user_suspensions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_suspensions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_user_suspensions_user_id" ON "user_suspensions" ("user_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_user_suspensions_active" ON "user_suspensions" ("active")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "user_suspensions"`);
  }
}
