import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTokenVersion1795184000000 implements MigrationInterface {
  name = 'AddUserTokenVersion1795184000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS token_version`,
    );
  }
}
