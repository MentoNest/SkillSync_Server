import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNormalizedNameForDuplicates1700000000002 implements MigrationInterface {
    name = 'AddNormalizedNameForDuplicates1700000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add normalizedName column
        await queryRunner.query(`
            ALTER TABLE skills 
            ADD COLUMN IF NOT EXISTS "normalizedName" VARCHAR(100);
        `);

        // Populate normalizedName from existing names (lowercase, trim, collapse spaces)
        await queryRunner.query(`
            UPDATE skills 
            SET "normalizedName" = LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')));
        `);

        // Set NOT NULL after populating
        await queryRunner.query(`
            ALTER TABLE skills 
            ALTER COLUMN "normalizedName" SET NOT NULL;
        `);

        // Create unique index on normalizedName
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_normalized_name ON skills("normalizedName");
        `);

        // Create unique index on lower(slug) for case-insensitive slug uniqueness
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_slug_lower ON skills(LOWER(slug));
        `);

        // Add pg_trgm extension for trigram similarity (for near-duplicate detection)
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        `);

        // Create trigram index on name for similarity searches
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_skills_name_trgm ON skills USING gin(name gin_trgm_ops);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_name_trgm;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_slug_lower;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_normalized_name;`);
        await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS "normalizedName";`);
        // Note: We don't drop pg_trgm extension as it might be used elsewhere
    }
}
