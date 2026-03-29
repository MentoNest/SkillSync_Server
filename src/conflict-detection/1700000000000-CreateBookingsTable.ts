import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsTable1700000000000 implements MigrationInterface {
  name = 'CreateBookingsTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."bookings_status_enum" AS ENUM (
        'pending',
        'confirmed',
        'cancelled',
        'completed',
        'rejected'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id"          UUID                              NOT NULL DEFAULT gen_random_uuid(),
        "listing_id"  CHARACTER VARYING                 NOT NULL,
        "mentee_id"   CHARACTER VARYING                 NOT NULL,
        "mentor_id"   CHARACTER VARYING                 NOT NULL,
        "start_time"  TIMESTAMP WITH TIME ZONE          NOT NULL,
        "end_time"    TIMESTAMP WITH TIME ZONE          NOT NULL,
        "status"      "public"."bookings_status_enum"   NOT NULL DEFAULT 'pending',
        "notes"       TEXT,
        "created_at"  TIMESTAMP WITH TIME ZONE          NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE          NOT NULL DEFAULT now(),

        CONSTRAINT "pk_bookings"            PRIMARY KEY ("id"),
        CONSTRAINT "chk_booking_time_order" CHECK ("end_time" > "start_time")
      )
    `);

    /*
     * Partial index covering only bookable statuses (pending + confirmed).
     * This is the index that powers our overlap query:
     *
     *   WHERE listing_id = $1
     *     AND status IN ('pending','confirmed')
     *     AND start_time < $end
     *     AND end_time   > $start
     *
     * PostgreSQL can use this index exclusively — no full table scan.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_bookings_listing_active_slots"
        ON "bookings" ("listing_id", "start_time", "end_time")
        WHERE status IN ('pending', 'confirmed')
    `);

    /*
     * Separate index for mentor-level double-booking checks.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_bookings_mentor_active_slots"
        ON "bookings" ("mentor_id", "start_time", "end_time")
        WHERE status IN ('pending', 'confirmed')
    `);

    /*
     * EXCLUDE constraint using GiST to enforce non-overlapping slots at the
     * DB level for the same listing (belt-and-suspenders with the service layer).
     *
     * Requires: CREATE EXTENSION IF NOT EXISTS btree_gist;
     */
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD CONSTRAINT "excl_booking_no_overlap"
        EXCLUDE USING GIST (
          listing_id WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status IN ('pending', 'confirmed'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "excl_booking_no_overlap"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_bookings_mentor_active_slots"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_bookings_listing_active_slots"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_status_enum"`,
    );
  }
}
