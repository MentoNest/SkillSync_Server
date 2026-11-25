import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatarVariantUrls1795210300000 implements MigrationInterface {
  name = 'AddUserAvatarVariantUrls1795210300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS avatar_thumbnail_url VARCHAR(2048) NULL,
        ADD COLUMN IF NOT EXISTS avatar_small_url     VARCHAR(2048) NULL,
        ADD COLUMN IF NOT EXISTS avatar_medium_url    VARCHAR(2048) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS avatar_medium_url,
        DROP COLUMN IF EXISTS avatar_small_url,
        DROP COLUMN IF EXISTS avatar_thumbnail_url
    `);
  }
}
