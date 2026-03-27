import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSkillSearchIndex1670000000000 implements MigrationInterface {
    name = 'AddSkillSearchIndex1670000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE skills ADD COLUMN aliases text[];
            ALTER TABLE skills ADD COLUMN description text;
            ALTER TABLE skills ADD COLUMN searchVector tsvector;

            CREATE INDEX skills_search_vector_idx ON skills USING GIN (searchVector);

            CREATE OR REPLACE FUNCTION skills_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.searchVector :=
                    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', array_to_string(coalesce(NEW.aliases, ARRAY[]::text[]), ' ')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER skills_search_vector_trigger
            BEFORE INSERT OR UPDATE ON skills
            FOR EACH ROW EXECUTE PROCEDURE skills_search_vector_update();

            -- Backfill existing rows
            UPDATE skills SET name = name;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TRIGGER IF EXISTS skills_search_vector_trigger ON skills;
            DROP FUNCTION IF EXISTS skills_search_vector_update();
            DROP INDEX IF EXISTS skills_search_vector_idx;
            ALTER TABLE skills DROP COLUMN IF EXISTS searchVector;
            ALTER TABLE skills DROP COLUMN IF EXISTS aliases;
            ALTER TABLE skills DROP COLUMN IF EXISTS description;
        `);
    }
}
