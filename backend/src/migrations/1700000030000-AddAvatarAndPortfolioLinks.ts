import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarAndPortfolioLinks1700000030000 implements MigrationInterface {
  name = 'AddAvatarAndPortfolioLinks1700000030000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" character varying(2048)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarThumbnailUrl" character varying(2048)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarSmallUrl" character varying(2048)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarMediumUrl" character varying(2048)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "platform" character varying(32) NOT NULL,
        "url" character varying(2048) NOT NULL,
        "title" character varying(255),
        "verified" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_portfolio_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_portfolio_links_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_portfolio_links_user_id" ON "portfolio_links" ("user_id")`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_portfolio_links_user_url" ON "portfolio_links" ("user_id", "url")`,
    );
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_portfolio_links_platform" ON "portfolio_links" ("platform")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "portfolio_links"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatarMediumUrl"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatarSmallUrl"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatarThumbnailUrl"`);
  }
}
