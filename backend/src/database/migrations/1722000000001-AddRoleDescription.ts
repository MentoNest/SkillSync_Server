import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleDescription1722000000001 implements MigrationInterface {
  name = 'AddRoleDescription1722000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "roles" ADD COLUMN "description" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "roles" DROP COLUMN IF EXISTS "description"
    `);
  }
}
