import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #995: Creates availability_slots and availability_exceptions tables.
 */
export class CreateAvailabilityTables1722200000000 implements MigrationInterface {
  name = 'CreateAvailabilityTables1722200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "availability_slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentorId" uuid NOT NULL,
        "dayOfWeek" smallint NOT NULL,
        "startTime" varchar(5) NOT NULL,
        "endTime" varchar(5) NOT NULL,
        "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_availability_slots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_availability_slots_user" FOREIGN KEY ("mentorId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_availability_slots_mentorId" ON "availability_slots" ("mentorId")
    `);

    await queryRunner.query(`
      CREATE TABLE "availability_exceptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentorId" uuid NOT NULL,
        "exceptionDate" date NOT NULL,
        "startTime" varchar(5),
        "endTime" varchar(5),
        "reason" text,
        "isAvailable" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_availability_exceptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_availability_exceptions_user" FOREIGN KEY ("mentorId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_availability_exceptions_mentorId"
        ON "availability_exceptions" ("mentorId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_availability_exceptions_date"
        ON "availability_exceptions" ("exceptionDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_exceptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_slots"`);
  }
}
