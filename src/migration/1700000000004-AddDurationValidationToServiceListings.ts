import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDurationValidationToServiceListings1700000000004 implements MigrationInterface {
    name = 'AddDurationValidationToServiceListings1700000000004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add check constraint to ensure duration is positive and within reasonable limits
        // Duration is in hours, min 0.5 hours (30 minutes), max 24 hours
        await queryRunner.query(`
            ALTER TABLE service_listings 
            ADD CONSTRAINT "CK_service_listings_duration_range" 
            CHECK (duration IS NULL OR (duration >= 0.5 AND duration <= 24))
        `);

        // Add comment to document the constraint
        await queryRunner.query(`
            COMMENT ON COLUMN service_listings.duration IS 'Service duration in hours (min: 0.5, max: 24)'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove check constraint
        await queryRunner.query(`
            ALTER TABLE service_listings 
            DROP CONSTRAINT IF EXISTS "CK_service_listings_duration_range"
        `);

        // Remove comment
        await queryRunner.query(`
            COMMENT ON COLUMN service_listings.duration IS NULL
        `);
    }
}
