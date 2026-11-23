import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileVersions1795183000000 implements MigrationInterface {
  name = 'AddProfileVersions1795183000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mentor_profiles
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE mentee_profiles
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mentee_profiles DROP COLUMN IF EXISTS version`,
    );
    await queryRunner.query(
      `ALTER TABLE mentor_profiles DROP COLUMN IF EXISTS version`,
    );
  }
}
