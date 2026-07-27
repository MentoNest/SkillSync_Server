import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1004: Adds an avatar URL to the users table so profile completeness
 * scoring can check for it (required field for mentor profiles).
 */
export class AddAvatarUrlToUsers1722400000000 implements MigrationInterface {
  name = 'AddAvatarUrlToUsers1722400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "avatarUrl" varchar(2048)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "avatarUrl"
    `);
  }
}
