import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserStatus1766000000000 implements MigrationInterface {
  name = 'AddUserStatus1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "users_status_enum" AS ENUM('active', 'pending_verification', 'suspended', 'deleted')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "status" "users_status_enum" NOT NULL DEFAULT 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "users_status_enum"`);
  }
}
