import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1722000000000 implements MigrationInterface {
  name = 'AddUserProfileFields1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "user_status_enum" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'suspended'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "email" varchar(255),
        ADD COLUMN "timezone" varchar,
        ADD COLUMN "locale" varchar,
        ADD COLUMN "lastLoginAt" TIMESTAMP,
        ADD COLUMN "deletedAt" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_walletAddress" ON "users" ("walletAddress")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "email" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_status" ON "users" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_createdAt" ON "users" ("createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_lastLoginAt" ON "users" ("lastLoginAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_lastLoginAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_walletAddress"`);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "deletedAt",
        DROP COLUMN IF EXISTS "lastLoginAt",
        DROP COLUMN IF EXISTS "locale",
        DROP COLUMN IF EXISTS "timezone",
        DROP COLUMN IF EXISTS "email"
    `);
  }
}
