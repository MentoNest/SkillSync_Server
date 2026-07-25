import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarToUsers1722200000000 implements MigrationInterface {
  name = 'AddAvatarToUsers1722200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "avatarUrl" varchar,
      ADD COLUMN "avatarThumbnailUrl" varchar,
      ADD COLUMN "avatarStorageKey" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "avatarStorageKey",
      DROP COLUMN IF EXISTS "avatarThumbnailUrl",
      DROP COLUMN IF EXISTS "avatarUrl"
    `);
  }
}
