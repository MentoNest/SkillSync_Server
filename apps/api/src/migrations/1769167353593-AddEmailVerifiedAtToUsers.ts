import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerifiedAtToUsers1769167353593 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "emailVerifiedAt" TIMESTAMP
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            DROP COLUMN "emailVerifiedAt"
        `);
  }
}
