import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeProfileSearchIndexes1725000000014 implements MigrationInterface {
  name = 'OptimizeProfileSearchIndexes1725000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_walletAddress_status"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('"IDX_users_role_status_createdAt"') IS NOT NULL
          AND to_regclass('"IDX_users_status_createdAt"') IS NULL THEN
          ALTER INDEX "IDX_users_role_status_createdAt" RENAME TO "IDX_users_status_createdAt";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_status_createdAt"
      ON "users" ("status", "createdAt")
    `);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_displayName_trgm"
      ON "users" USING GIN ("displayName" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_email_trgm"
      ON "users" USING GIN (LOWER("email") gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_walletAddress_trgm"
      ON "users" USING GIN (LOWER("walletAddress") gin_trgm_ops)
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_skills"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mentor_profiles_skills_gin"
      ON "mentor_profiles" USING GIN ("skills")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_skills_gin"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mentor_profiles_skills"
      ON "mentor_profiles" ("skills")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_displayName_trgm"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_trgm"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_walletAddress_trgm"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_walletAddress_status" ON "users" ("walletAddress", "status")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('"IDX_users_status_createdAt"') IS NOT NULL
          AND to_regclass('"IDX_users_role_status_createdAt"') IS NULL THEN
          ALTER INDEX "IDX_users_status_createdAt" RENAME TO "IDX_users_role_status_createdAt";
        END IF;
      END $$;
    `);
  }
}
