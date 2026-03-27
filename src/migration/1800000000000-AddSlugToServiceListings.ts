import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlugToServiceListings1800000000000 implements MigrationInterface {
    name = 'AddSlugToServiceListings1800000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add slug column
        await queryRunner.query(`
            ALTER TABLE service_listings 
            ADD COLUMN IF NOT EXISTS slug VARCHAR(150);
        `);

        // Populate slug from existing titles (generate SEO-friendly slug)
        await queryRunner.query(`
            UPDATE service_listings 
            SET slug = LOWER(
                TRIM(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(title, '[^\\w\\s-]', '', 'g'),
                        '\\s+',
                        '-',
                        'g'
                    )
                )
            )
            WHERE slug IS NULL;
        `);

        // Set NOT NULL after populating
        await queryRunner.query(`
            ALTER TABLE service_listings 
            ALTER COLUMN slug SET NOT NULL;
        `);

        // Create unique index on slug for case-insensitive uniqueness
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_service_listings_slug_lower ON service_listings(LOWER(slug));
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_service_listings_slug_lower;`);
        await queryRunner.query(`ALTER TABLE service_listings DROP COLUMN IF EXISTS slug;`);
    }
}
