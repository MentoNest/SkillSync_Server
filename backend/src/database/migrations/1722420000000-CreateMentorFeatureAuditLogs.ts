import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1005: Audit log table for feature/unfeature admin actions.
 */
export class CreateMentorFeatureAuditLogs1722420000000 implements MigrationInterface {
  name = 'CreateMentorFeatureAuditLogs1722420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "mentor_feature_audit_action_enum" AS ENUM (
        'featured', 'unfeatured', 'order_updated', 'auto_expired'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "mentor_feature_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentorId" uuid NOT NULL,
        "adminId" uuid,
        "action" "mentor_feature_audit_action_enum" NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mentor_feature_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mentor_feature_audit_logs_mentor" FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mentor_feature_audit_logs_admin" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_feature_audit_logs_mentorId" ON "mentor_feature_audit_logs" ("mentorId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_feature_audit_logs_adminId" ON "mentor_feature_audit_logs" ("adminId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mentor_feature_audit_logs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "mentor_feature_audit_action_enum"`,
    );
  }
}
