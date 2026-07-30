import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1002: Adds 'pending_verification' to the user_status_enum for users who
 * have not yet completed email verification.
 */
export class AddPendingVerificationToUserStatusEnum1722400000000
  implements MigrationInterface
{
  name = 'AddPendingVerificationToUserStatusEnum1722400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "user_status_enum" ADD VALUE IF NOT EXISTS 'pending_verification'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support removing enum values directly; rebuild the type.
    await queryRunner.query(`
      ALTER TYPE "user_status_enum" RENAME TO "user_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('active', 'suspended', 'deleted')
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "status" DROP DEFAULT,
        ALTER COLUMN "status" TYPE "user_status_enum" USING "status"::text::"user_status_enum",
        ALTER COLUMN "status" SET DEFAULT 'active'
    `);
    await queryRunner.query(`DROP TYPE "user_status_enum_old"`);
  }
}
