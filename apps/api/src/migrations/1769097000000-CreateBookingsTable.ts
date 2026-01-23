import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsTable1769097000000 implements MigrationInterface {
  name = 'CreateBookingsTable1769097000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('requested', 'accepted', 'declined', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_profile_id" uuid NOT NULL,
        "mentee_user_id" uuid NOT NULL,
        "start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'requested',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_mentor_profile_start_end" ON "bookings" ("mentor_profile_id", "start", "end")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_mentee_user" ON "bookings" ("mentee_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_status" ON "bookings" ("status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_mentor_profile" FOREIGN KEY ("mentor_profile_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_mentee_user" FOREIGN KEY ("mentee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_mentee_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_mentor_profile"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_mentee_user"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bookings_mentor_profile_start_end"`,
    );
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
  }
}
