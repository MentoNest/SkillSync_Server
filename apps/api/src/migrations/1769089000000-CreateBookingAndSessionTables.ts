import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingAndSessionTables1769089000000 implements MigrationInterface {
  name = 'CreateBookingAndSessionTables1769089000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create bookings table
    await queryRunner.query(`
      CREATE TYPE "public"."bookings_status_enum" AS ENUM('draft', 'accepted', 'declined', 'cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "mentor_profile_id" uuid NOT NULL,
        "mentee_user_id" uuid NOT NULL,
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP NOT NULL,
        "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'draft',
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_listing_id" ON "bookings" ("listing_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_mentor_profile_id" ON "bookings" ("mentor_profile_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_mentee_user_id" ON "bookings" ("mentee_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_status" ON "bookings" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_start_time" ON "bookings" ("start_time")
    `);

    // Add foreign keys for bookings
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_mentor_profile_id"
      FOREIGN KEY ("mentor_profile_id")
      REFERENCES "mentor_profiles"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "FK_bookings_mentee_user_id"
      FOREIGN KEY ("mentee_user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Create sessions table
    await queryRunner.query(`
      CREATE TYPE "public"."sessions_status_enum" AS ENUM('scheduled', 'in_progress', 'completed')
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "mentor_profile_id" uuid NOT NULL,
        "mentee_user_id" uuid NOT NULL,
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP NOT NULL,
        "status" "public"."sessions_status_enum" NOT NULL DEFAULT 'scheduled',
        "notes" text,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_booking_id" UNIQUE ("booking_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_booking_id" ON "sessions" ("booking_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_mentor_profile_id" ON "sessions" ("mentor_profile_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_mentee_user_id" ON "sessions" ("mentee_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_status" ON "sessions" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_start_time" ON "sessions" ("start_time")
    `);

    // Add foreign keys for sessions
    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_sessions_booking_id"
      FOREIGN KEY ("booking_id")
      REFERENCES "bookings"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_sessions_mentor_profile_id"
      FOREIGN KEY ("mentor_profile_id")
      REFERENCES "mentor_profiles"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_sessions_mentee_user_id"
      FOREIGN KEY ("mentee_user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop sessions table and related objects
    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "FK_sessions_mentee_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "FK_sessions_mentor_profile_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "FK_sessions_booking_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_sessions_start_time"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_sessions_status"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_sessions_mentee_user_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_sessions_mentor_profile_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_sessions_booking_id"
    `);

    await queryRunner.query(`DROP TABLE "sessions"`);

    await queryRunner.query(`DROP TYPE "public"."sessions_status_enum"`);

    // Drop bookings table and related objects
    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP CONSTRAINT "FK_bookings_mentee_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP CONSTRAINT "FK_bookings_mentor_profile_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      DROP CONSTRAINT "FK_bookings_listing_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_bookings_start_time"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_bookings_status"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_bookings_mentee_user_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_bookings_mentor_profile_id"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_bookings_listing_id"
    `);

    await queryRunner.query(`DROP TABLE "bookings"`);

    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
  }
}
