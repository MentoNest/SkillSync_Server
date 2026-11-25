import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePortfolioLinks1795176000000 implements MigrationInterface {
  name = 'CreatePortfolioLinks1795176000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE portfolio_platform_enum AS ENUM (
          'github','linkedin','twitter','personal_website','behance','dribbble','medium','devto','youtube'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE portfolio_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(56) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
        platform portfolio_platform_enum NOT NULL,
        url VARCHAR(2048) NOT NULL,
        display_title VARCHAR(120) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_portfolio_links_wallet ON portfolio_links (wallet_address)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_portfolio_links_wallet_url ON portfolio_links (wallet_address, url)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_portfolio_links_wallet_url`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_portfolio_links_wallet`);
    await queryRunner.query(`DROP TABLE IF EXISTS portfolio_links`);
    await queryRunner.query(`DROP TYPE IF EXISTS portfolio_platform_enum`);
  }
}
