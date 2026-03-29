import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchToServiceListings2000000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tsvector column for full-text search
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    `);

    // Create index on tsvector column for fast full-text search queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_listings_search_vector" 
      ON "service_listings" USING gin("search_vector")
    `);

    // Create index on title and description for regular ILIKE searches as fallback
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_service_listings_title_description"
      ON "service_listings" (title, description)
    `);

    // Create trigger function to automatically update search_vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_service_listings_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to call the function before insert or update
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS service_listings_search_vector_trigger ON "service_listings"
    `);

    await queryRunner.query(`
      CREATE TRIGGER service_listings_search_vector_trigger
      BEFORE INSERT OR UPDATE ON "service_listings"
      FOR EACH ROW
      EXECUTE FUNCTION update_service_listings_search_vector()
    `);

    // Backfill search_vector for existing records
    await queryRunner.query(`
      UPDATE "service_listings"
      SET search_vector = 
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'C')
      WHERE search_vector IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS service_listings_search_vector_trigger ON "service_listings"
    `);

    // Drop trigger function
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_service_listings_search_vector()
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_service_listings_search_vector"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_service_listings_title_description"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "service_listings"
      DROP COLUMN IF EXISTS "search_vector"
    `);
  }
}
