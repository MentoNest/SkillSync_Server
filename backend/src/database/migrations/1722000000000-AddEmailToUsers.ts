import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailToUsers1722000000000 implements MigrationInterface {
  name = 'AddEmailToUsers1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "email" varchar(255)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "email"`,
    );
  }
}
