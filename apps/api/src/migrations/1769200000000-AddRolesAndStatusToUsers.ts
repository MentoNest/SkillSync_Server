import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRolesAndStatusToUsers1769200000000 implements MigrationInterface {
  name = 'AddRolesAndStatusToUsers1769200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types for roles and status
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.user_role_enum AS ENUM ('mentee', 'mentor', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.user_status_enum AS ENUM ('active', 'inactive', 'pending', 'suspended');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add roles column
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "roles" public.user_role_enum[] NOT NULL DEFAULT ARRAY['mentee']::public.user_role_enum[]
    `);

    // Add status column
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "status" public.user_status_enum NOT NULL DEFAULT 'pending'
    `);

    // Make password_hash non-nullable
    await queryRunner.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "password_hash" SET NOT NULL
    `);

    // Add indices
    await queryRunner.query(`
      CREATE INDEX "IDX_users_email" ON "users" ("email")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_status" ON "users" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email"
    `);

    // Remove columns
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN "status"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN "roles"
    `);

    // Make password_hash nullable again
    await queryRunner.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "password_hash" DROP NOT NULL
    `);

    // Drop ENUM types
    await queryRunner.query(`
      DROP TYPE IF EXISTS public.user_status_enum
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS public.user_role_enum
    `);
  }
}
