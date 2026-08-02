import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1003: Enforces unique usernames at the database level and tracks the
 * last username change so the 30-day cooldown can be validated.
 */
export class AddUsernameUniqueAndCooldown1722500000000
  implements MigrationInterface
{
  name = 'AddUsernameUniqueAndCooldown1722500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "username" TYPE varchar(30),
        ADD COLUMN IF NOT EXISTS "usernameChangedAt" timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_username"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "usernameChangedAt"
    `);
  }
}
