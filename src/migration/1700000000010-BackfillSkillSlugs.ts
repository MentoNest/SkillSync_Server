import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Backfills slugs for skills that might be missing them or have duplicates.
 * Also ensures they are SEO-friendly (lowercase, hyphenated, ASCII-safe).
 */
export class BackfillSkillSlugs1700000000010 implements MigrationInterface {
    name = 'BackfillSkillSlugs1700000000010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Ensure slug column is present (defensive)
        const hasColumn = await queryRunner.hasColumn('skills', 'slug');
        if (!hasColumn) {
            await queryRunner.query(`ALTER TABLE skills ADD COLUMN slug VARCHAR(120)`);
        }

        // 2. Fetch all skills (using name and slug to determine what to do)
        const skills = await queryRunner.query(`SELECT id, name, slug FROM skills`);

        for (const skill of skills) {
            // Generate base slug from name
            const baseSlug = skill.name
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '-')      // Replace spaces with hyphens
                .replace(/-+/g, '-');      // Collapse multiple hyphens

            let finalSlug = baseSlug;

            // Handle empty name edge case
            if (!finalSlug) {
                finalSlug = 'skill';
            }

            // Check if existing slug is already good enough (matches generated or is not null)
            // But we want to ensure uniqueness now.
            
            let counter = 1;
            let currentSlug = finalSlug;

            while (true) {
                const existing = await queryRunner.query(
                    `SELECT id FROM skills WHERE LOWER(slug) = $1 AND id != $2`,
                    [currentSlug.toLowerCase(), skill.id]
                );

                if (existing.length === 0) {
                    break;
                }

                counter++;
                currentSlug = `${finalSlug}-${counter}`;
            }

            // Update only if it changed or was null
            if (skill.slug !== currentSlug) {
                await queryRunner.query(
                    `UPDATE skills SET slug = $1 WHERE id = $2`,
                    [currentSlug, skill.id]
                );
            }
        }

        // 3. Ensure slug column is NOT NULL now
        await queryRunner.query(`ALTER TABLE skills ALTER COLUMN slug SET NOT NULL`);

        // 4. Ensure unique index on LOWER(slug) exists
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_skills_slug_lower;
            CREATE UNIQUE INDEX idx_skills_slug_lower ON skills(LOWER(slug));
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No safe way to revert backfill without track of previous values
    }
}
