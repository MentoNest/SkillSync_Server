import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #997: Creates verification_badges and verification_audit_logs tables.
 */
export class CreateVerificationTables1722300000000 implements MigrationInterface {
  name = 'CreateVerificationTables1722300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "verification_status_enum" AS ENUM ('pending', 'verified', 'revoked')
    `);
    await queryRunner.query(`
      CREATE TYPE "verification_method_enum" AS ENUM ('email', 'id', 'credential')
    `);
    await queryRunner.query(`
      CREATE TYPE "verification_audit_action_enum" AS ENUM (
        'request_submitted', 'verified', 'revoked', 'notes_updated'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "verification_badges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentorId" uuid NOT NULL,
        "status" "verification_status_enum" NOT NULL DEFAULT 'pending',
        "verificationMethod" "verification_method_enum",
        "verifiedByAdminId" uuid,
        "notes" text,
        "verifiedAt" TIMESTAMPTZ,
        "revokedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_badges" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_verification_badges_mentorId" UNIQUE ("mentorId"),
        CONSTRAINT "FK_verification_badges_mentor"
          FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verification_badges_admin"
          FOREIGN KEY ("verifiedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_verification_badges_mentorId" ON "verification_badges" ("mentorId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_verification_badges_status" ON "verification_badges" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "verification_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentorId" uuid NOT NULL,
        "adminId" uuid,
        "action" "verification_audit_action_enum" NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_verification_audit_logs_mentor"
          FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_verification_audit_logs_admin"
          FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_verification_audit_logs_mentorId"
        ON "verification_audit_logs" ("mentorId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_verification_audit_logs_adminId"
        ON "verification_audit_logs" ("adminId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_badges"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_audit_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_status_enum"`);
  }
}
