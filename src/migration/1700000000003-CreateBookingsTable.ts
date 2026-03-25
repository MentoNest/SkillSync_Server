import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBookingsTable1700000000003 implements MigrationInterface {
    name = 'CreateBookingsTable1700000000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create booking status enum
        await queryRunner.query(`
            CREATE TYPE "booking_status_enum" AS ENUM (
                'pending', 
                'confirmed', 
                'completed', 
                'cancelled', 
                'rejected'
            )
        `);

        // Create bookings table
        await queryRunner.query(`
            CREATE TABLE bookings (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "mentorId" varchar NOT NULL,
                "menteeId" varchar NOT NULL,
                "serviceListingId" uuid NOT NULL,
                status "booking_status_enum" NOT NULL DEFAULT 'pending',
                duration integer NOT NULL,
                "scheduledAt" timestamp NOT NULL,
                "totalPrice" decimal(10,2) NOT NULL,
                notes text,
                "meetingLink" varchar,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now()
            )
        `);

        // Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE bookings 
            ADD CONSTRAINT "FK_bookings_service_listing" 
            FOREIGN KEY ("serviceListingId") 
            REFERENCES service_listings(id) 
            ON DELETE CASCADE
        `);

        // Create index on mentorId and menteeId for faster queries
        await queryRunner.query(`
            CREATE INDEX "IDX_bookings_mentorId" ON bookings ("mentorId")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_bookings_menteeId" ON bookings ("menteeId")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_bookings_status" ON bookings ("status")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_menteeId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_mentorId"`);

        // Drop foreign key
        await queryRunner.query(`
            ALTER TABLE bookings 
            DROP CONSTRAINT IF EXISTS "FK_bookings_service_listing"
        `);

        // Drop table
        await queryRunner.query(`DROP TABLE IF EXISTS bookings`);

        // Drop enum
        await queryRunner.query(`DROP TYPE IF EXISTS "booking_status_enum"`);
    }
}
