import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordHashToUsers1769080000000 implements MigrationInterface {
  name = 'AddPasswordHashToUsers1769080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "password_hash" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "avatarUrl" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "password_hash"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "avatarUrl"
    `);
  }
}
