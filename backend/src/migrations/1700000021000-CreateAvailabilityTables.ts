import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAvailabilityTables1700000021000 implements MigrationInterface {
  name = 'CreateAvailabilityTables1700000021000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(`
      CREATE TABLE "availability_slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_id" uuid NOT NULL,
        "day_of_week" integer NOT NULL,
        "start_time" character varying(5) NOT NULL,
        "end_time" character varying(5) NOT NULL,
        "timezone" character varying(64) NOT NULL DEFAULT 'UTC',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_availability_slots_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_availability_slots_day_of_week" CHECK ("day_of_week" >= 0 AND "day_of_week" <= 6),
        CONSTRAINT "FK_availability_slots_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_availability_slots_mentor_id" ON "availability_slots" ("mentor_id")`);

    await q.query(`
      CREATE TABLE "availability_exceptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_id" uuid NOT NULL,
        "date" date NOT NULL,
        "start_time" character varying(5),
        "end_time" character varying(5),
        "reason" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_availability_exceptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_availability_exceptions_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_availability_exceptions_mentor_id" ON "availability_exceptions" ("mentor_id")`);
    await q.query(
      `CREATE INDEX "IDX_availability_exceptions_mentor_date" ON "availability_exceptions" ("mentor_id", "date")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "availability_exceptions"`);
    await q.query(`DROP TABLE "availability_slots"`);
  }
}
