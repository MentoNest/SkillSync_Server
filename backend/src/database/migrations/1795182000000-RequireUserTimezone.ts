import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequireUserTimezone1795182000000 implements MigrationInterface {
  name = 'RequireUserTimezone1795182000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE users
        ALTER COLUMN timezone SET DEFAULT 'UTC',
        ALTER COLUMN timezone SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ALTER COLUMN timezone DROP NOT NULL`,
    );
  }
}
