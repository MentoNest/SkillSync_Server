import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMentorVerificationRequests1700000023000 implements MigrationInterface {
  name = 'CreateMentorVerificationRequests1700000023000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(
      `CREATE TYPE "verification_request_status_enum" AS ENUM ('pending','approved','rejected')`,
    );
    await q.query(`
      CREATE TABLE "mentor_verification_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_id" uuid NOT NULL,
        "status" "verification_request_status_enum" NOT NULL DEFAULT 'pending',
        "note" character varying(1000),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_mentor_verification_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mentor_verification_requests_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX "IDX_mentor_verification_requests_mentor_id" ON "mentor_verification_requests" ("mentor_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_mentor_verification_requests_status" ON "mentor_verification_requests" ("status")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "mentor_verification_requests"`);
    await q.query(`DROP TYPE "verification_request_status_enum"`);
  }
}
