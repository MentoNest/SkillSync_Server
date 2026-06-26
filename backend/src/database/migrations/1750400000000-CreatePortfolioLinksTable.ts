import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreatePortfolioLinksTable
 *
 * Adds the `portfolio_links` table required by issue #711:
 *   - One row per external portfolio link that a user wants to advertise
 *   - Hard limit of 10 links per user enforced by PortfolioLinksService
 *   - (user_id, url) is uniquely indexed to prevent duplicates within one user
 *
 * Indexes are tuned for:
 *   - Listing all links of a user       (user_id)
 *   - Detecting duplicates on insert    (user_id, url)
 */
export class CreatePortfolioLinksTable1750400000000 implements MigrationInterface {
  name = 'CreatePortfolioLinksTable1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_links" (
        "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    UUID          NOT NULL,
        "title"      VARCHAR(50)   NOT NULL,
        "url"        VARCHAR(2048) NOT NULL,
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_portfolio_links" PRIMARY KEY ("id"),
        CONSTRAINT "FK_portfolio_links_user"
          FOREIGN KEY ("user_id")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    // The unique composite (`user_id`, `url`) is the only index we need:
    //   - it deduplicates inserts for the same user
    //   - Postgres can use it as a prefix index for `user_id`-only lookups
    //     (e.g., listing every link for a user)
    // so we don't add a redundant standalone `user_id` index.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_portfolio_links_user_url"
        ON "portfolio_links" ("user_id", "url")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_portfolio_links_user_url"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "portfolio_links"`);
  }
}
